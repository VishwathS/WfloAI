import { fetch as undiciFetch, type Response as UndiciResponse } from "undici";
import { decryptSecret } from "@/lib/crypto";
import {
  BLOCKED_REQUEST_HEADERS,
  HTTP_LIMITS,
  isValidHeaderName
} from "@/lib/http/constants";
import { assertUrlAllowed, getGuardedDispatcher } from "@/lib/http/ssrfGuard";
import { getUserCredential } from "@/lib/integrations/repo";
import {
  claimAction,
  markActionFailed,
  markActionSucceeded,
  markActionUnknown
} from "@/lib/integrations/idempotency";
import {
  acquireConcurrencySlot,
  checkHttpMutationQuota,
  consumeRunAction
} from "@/lib/integrations/limits";
import { redactSecrets, redactSensitiveKeys } from "@/lib/integrations/redact";
import { recordAuditEvent } from "@/lib/integrations/audit";
import type {
  ApiKeySecret,
  BasicSecret,
  BearerSecret,
  IntegrationContext
} from "@/lib/integrations/types";
import type { HttpKeyValue, HttpMethod, HttpRequestNodeData } from "@/lib/types";

export interface ResolvedHttpConfig {
  method: HttpMethod;
  url: string;
  queryParams: HttpKeyValue[];
  headers: HttpKeyValue[];
  body?: string;
  authType: HttpRequestNodeData["authType"];
  credentialId?: string;
}

interface ResolvedAuth {
  headerName: string;
  headerValue: string;
  secretValues: string[];
}

const MUTATING_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);

function validateStaticLimits(config: ResolvedHttpConfig): void {
  if (config.url.length > HTTP_LIMITS.MAX_URL_LENGTH) {
    throw new Error(`The URL is too long (max ${HTTP_LIMITS.MAX_URL_LENGTH} characters).`);
  }
  const headerRows = config.headers.filter((h) => h.key.trim());
  if (headerRows.length > HTTP_LIMITS.MAX_HEADERS) {
    throw new Error(`Too many headers (max ${HTTP_LIMITS.MAX_HEADERS}).`);
  }
  for (const header of headerRows) {
    const name = header.key.trim();
    if (!isValidHeaderName(name)) {
      throw new Error(`"${name}" isn't a valid header name.`);
    }
    if (BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) {
      throw new Error(`The "${name}" header can't be set manually.`);
    }
    if (/[\r\n]/.test(header.value)) {
      throw new Error(`The "${name}" header value can't contain line breaks.`);
    }
    if (header.value.length > HTTP_LIMITS.MAX_HEADER_VALUE_LENGTH) {
      throw new Error(`The "${name}" header value is too long.`);
    }
  }
  if (config.body && Buffer.byteLength(config.body, "utf8") > HTTP_LIMITS.MAX_BODY_BYTES) {
    throw new Error("The request body is too large (max 256 KB).");
  }
}

async function resolveAuth(
  ctx: IntegrationContext,
  config: ResolvedHttpConfig
): Promise<ResolvedAuth | null> {
  if (config.authType === "none") {
    return null;
  }
  if (!config.credentialId) {
    throw new Error("Pick a credential for this node's authentication, or set Auth to None.");
  }
  const credential = await getUserCredential(ctx.supabase, ctx.userId, config.credentialId);
  if (!credential) {
    throw new Error("The selected credential no longer exists — pick another in the node settings.");
  }
  if (credential.type !== config.authType) {
    throw new Error("The selected credential doesn't match this node's auth type.");
  }

  const secretJson = JSON.parse(decryptSecret(credential.secret_encrypted)) as
    | BearerSecret
    | BasicSecret
    | ApiKeySecret;

  if (credential.type === "bearer") {
    const { token } = secretJson as BearerSecret;
    return { headerName: "Authorization", headerValue: `Bearer ${token}`, secretValues: [token] };
  }
  if (credential.type === "basic") {
    const { username, password } = secretJson as BasicSecret;
    const pair = Buffer.from(`${username}:${password}`).toString("base64");
    return {
      headerName: "Authorization",
      headerValue: `Basic ${pair}`,
      secretValues: [password, pair]
    };
  }
  const { headerName, value } = secretJson as ApiKeySecret;
  return { headerName, headerValue: value, secretValues: [value] };
}

function buildRequestUrl(config: ResolvedHttpConfig): URL {
  let url: URL;
  try {
    url = new URL(config.url.trim());
  } catch {
    throw new Error("That URL doesn't look right — it must start with http:// or https://.");
  }
  assertUrlAllowed(url);
  for (const param of config.queryParams) {
    if (param.key.trim()) {
      url.searchParams.append(param.key.trim(), param.value);
    }
  }
  return url;
}

async function readBodyWithCap(
  response: UndiciResponse
): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (!response.body) {
    return { bytes: Buffer.alloc(0), truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > HTTP_LIMITS.MAX_RESPONSE_BYTES) {
      chunks.push(chunk.subarray(0, chunk.length - (total - HTTP_LIMITS.MAX_RESPONSE_BYTES)));
      await reader.cancel();
      return { bytes: Buffer.concat(chunks), truncated: true };
    }
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks), truncated: false };
}

export function isTextualContentType(contentType: string): boolean {
  const type = contentType.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("x-www-form-urlencoded") ||
    type.includes("javascript")
  );
}

function formatResponseOutput(
  bytes: Buffer,
  truncated: boolean,
  contentType: string,
  secretValues: string[]
): string {
  if (bytes.length > 0 && contentType && !isTextualContentType(contentType)) {
    return JSON.stringify(
      { status: "Binary response received", contentType, sizeBytes: bytes.length },
      null,
      2
    );
  }

  const text = bytes.toString("utf8");
  let output: string;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      output = JSON.stringify(redactSensitiveKeys(parsed), null, 2);
    } else {
      output = text;
    }
  } catch {
    output = text;
  }

  output = redactSecrets(output, secretValues);
  if (truncated) {
    output += "\n\n⚠️ Response truncated at 500 KB.";
  }
  return output;
}

export interface HopState {
  url: URL;
  method: HttpMethod;
  body: string | undefined;
  includeCredentials: boolean;
}

export function nextHop(
  current: HopState,
  status: number,
  location: string,
  hadCredentials: boolean
): HopState {
  let target: URL;
  try {
    target = new URL(location, current.url);
  } catch {
    throw new Error("The server sent an invalid redirect.");
  }
  assertUrlAllowed(target);

  const crossOrigin = target.origin !== current.url.origin;
  const downgrade = current.url.protocol === "https:" && target.protocol === "http:";
  if (downgrade && (hadCredentials || current.body !== undefined)) {
    throw new Error("The server redirected from HTTPS to HTTP — request blocked to protect your data.");
  }

  // 301/302/303 follow as GET without a body; 307/308 preserve method + body.
  const preserveMethod = status === 307 || status === 308;
  return {
    url: target,
    method: preserveMethod ? current.method : "GET",
    body: preserveMethod ? current.body : undefined,
    // Credential-derived headers never cross origins.
    includeCredentials: current.includeCredentials && !crossOrigin
  };
}

async function performRequest(
  config: ResolvedHttpConfig,
  auth: ResolvedAuth | null
): Promise<{ output: string; status: number }> {
  const secretValues = auth?.secretValues ?? [];
  const signal = AbortSignal.timeout(HTTP_LIMITS.TOTAL_TIMEOUT_MS);
  const bodyIsJson = (() => {
    if (!config.body?.trim()) return false;
    try {
      JSON.parse(config.body);
      return true;
    } catch {
      return false;
    }
  })();

  let hop: HopState = {
    url: buildRequestUrl(config),
    method: config.method,
    body: config.method === "GET" ? undefined : config.body || undefined,
    includeCredentials: true
  };

  for (let redirects = 0; ; redirects++) {
    const headers = new Headers();
    for (const header of config.headers) {
      if (header.key.trim()) {
        headers.append(header.key.trim(), header.value);
      }
    }
    if (hop.body !== undefined && bodyIsJson && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (auth && hop.includeCredentials) {
      headers.set(auth.headerName, auth.headerValue);
    }

    const response = await undiciFetch(hop.url, {
      method: hop.method,
      headers,
      body: hop.body,
      dispatcher: getGuardedDispatcher(),
      redirect: "manual",
      signal
    });

    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      if (redirects >= HTTP_LIMITS.MAX_REDIRECTS) {
        throw new Error("Too many redirects — the request was stopped.");
      }
      hop = nextHop(hop, response.status, location, auth !== null);
      continue;
    }

    const { bytes, truncated } = await readBodyWithCap(response);
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      const snippet = redactSecrets(bytes.toString("utf8").slice(0, 300), secretValues);
      const statusText = response.statusText ? ` (${response.statusText})` : "";
      throw new Error(
        `Request failed with status ${response.status}${statusText}.${snippet ? ` ${snippet}` : ""}`
      );
    }

    return {
      output: formatResponseOutput(bytes, truncated, contentType, secretValues),
      status: response.status
    };
  }
}

function mapNetworkError(error: unknown, hostname: string, secretValues: string[]): Error {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return new Error(`The request timed out after ${HTTP_LIMITS.TOTAL_TIMEOUT_MS / 1000} seconds.`);
    }
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    const causeMessage = cause?.message ?? "";
    if (cause?.code === "ENOTFOUND" || causeMessage.includes("ENOTFOUND")) {
      return new Error(`Couldn't reach ${hostname} — check the URL.`);
    }
    if (causeMessage) {
      return new Error(redactSecrets(causeMessage, secretValues));
    }
    return new Error(redactSecrets(error.message, secretValues));
  }
  return new Error("The request failed unexpectedly.");
}

export async function executeHttpRequest(
  config: ResolvedHttpConfig,
  ctx: IntegrationContext,
  nodeId: string
): Promise<string> {
  validateStaticLimits(config);
  const parsedUrl = buildRequestUrl(config);
  consumeRunAction(ctx);

  const auth = await resolveAuth(ctx, config);
  const isMutating = MUTATING_METHODS.has(config.method);
  const actionType = `http.${config.method}`;

  if (isMutating) {
    await checkHttpMutationQuota(ctx.supabase, ctx.userId);
    const claim = await claimAction(ctx, nodeId, actionType);
    if (claim.kind === "replay") {
      return claim.output;
    }
    if (claim.kind === "blocked") {
      throw new Error(claim.message);
    }
  }

  const releaseSlot = acquireConcurrencySlot(ctx.userId);
  let requestSent = false;

  try {
    requestSent = true;
    const { output } = await performRequest(config, auth);

    if (isMutating) {
      await markActionSucceeded(ctx.supabase, ctx.runId, nodeId, { output });
    }
    await recordAuditEvent(ctx.supabase, ctx.userId, "http.request.attempted", "succeeded");
    return output;
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

    if (isMutating) {
      // A timeout after the request went out is ambiguous — the provider may
      // have processed it. Mark unknown so it's never auto-retried.
      if (isTimeout && requestSent) {
        await markActionUnknown(ctx.supabase, ctx.runId, nodeId);
      } else {
        await markActionFailed(ctx.supabase, ctx.runId, nodeId);
      }
    }
    await recordAuditEvent(
      ctx.supabase,
      ctx.userId,
      "http.request.attempted",
      isTimeout ? "unknown" : "failed"
    );
    throw mapNetworkError(error, parsedUrl.hostname, auth?.secretValues ?? []);
  } finally {
    releaseSlot();
  }
}
