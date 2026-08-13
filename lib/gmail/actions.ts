import { gmailFetch, getGmailAccessToken, type GmailAccess } from "@/lib/gmail/client";
import { buildMimeMessage, parseRecipients } from "@/lib/gmail/mime";
import { findUpstreamEmailRef, type ParentNodeMetadata } from "@/lib/gmail/infer";
import {
  gmailReadActionsEnabled,
  hasScopes,
  isReadAction,
  requiredScopesForAction
} from "@/lib/gmail/scopes";
import { claimAction, markActionFailed, markActionSucceeded, markActionUnknown } from "@/lib/integrations/idempotency";
import { checkGmailSendQuota, consumeRunAction } from "@/lib/integrations/limits";
import { recordAuditEvent, type AuditAction } from "@/lib/integrations/audit";
import type { GmailNodeMetadata, IntegrationContext } from "@/lib/integrations/types";
import type { GmailActionType } from "@/lib/types";

export interface ResolvedGmailFields {
  action: GmailActionType;
  to?: string;
  subject?: string;
  body?: string;
  replyTo?: string;
  query?: string;
  maxResults?: number;
}

export interface GmailActionResult {
  output: string;
  metadata?: Record<string, unknown>;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
}

interface GmailMessageList {
  messages?: Array<{ id: string; threadId: string }>;
}

const FIND_CONCURRENCY = 5;

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return (
    headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractBody(part: GmailMessagePart | undefined): string {
  if (!part) return "";

  function collect(node: GmailMessagePart, mimeType: string): string | null {
    if (node.mimeType === mimeType && node.body?.data) {
      return decodeBase64Url(node.body.data);
    }
    for (const child of node.parts ?? []) {
      const found = collect(child, mimeType);
      if (found !== null) return found;
    }
    return null;
  }

  const plain = collect(part, "text/plain");
  if (plain !== null) return plain;

  const html = collect(part, "text/html");
  if (html !== null) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  return "";
}

function toIsoDate(internalDate: string | undefined): string {
  const ms = Number(internalDate);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

function isAmbiguousNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error.message === "fetch failed")
  );
}

// Wraps a mutating Gmail call in the idempotency ledger: claim before the
// external call, replay stored results, mark succeeded/failed/unknown after.
async function runMutating(
  ctx: IntegrationContext,
  nodeId: string,
  actionType: "gmail.send" | "gmail.draft" | "gmail.reply",
  auditAction: AuditAction,
  fn: () => Promise<{ output: string; metadata?: Record<string, unknown>; externalResultId?: string }>
): Promise<GmailActionResult> {
  const claim = await claimAction(ctx, nodeId, actionType);
  if (claim.kind === "replay") {
    return { output: claim.output, metadata: claim.metadata ?? undefined };
  }
  if (claim.kind === "blocked") {
    throw new Error(claim.message);
  }

  try {
    const result = await fn();
    await markActionSucceeded(ctx.supabase, ctx.runId, nodeId, result);
    await recordAuditEvent(ctx.supabase, ctx.userId, auditAction, "succeeded", result.externalResultId);
    return { output: result.output, metadata: result.metadata };
  } catch (error) {
    if (isAmbiguousNetworkError(error)) {
      await markActionUnknown(ctx.supabase, ctx.runId, nodeId);
      await recordAuditEvent(ctx.supabase, ctx.userId, auditAction, "unknown");
      throw new Error(
        "The Gmail request may or may not have completed — check Gmail before running again."
      );
    }
    await markActionFailed(ctx.supabase, ctx.runId, nodeId);
    await recordAuditEvent(ctx.supabase, ctx.userId, auditAction, "failed");
    throw error;
  }
}

function assertScopes(access: GmailAccess, action: GmailActionType): void {
  if (hasScopes(access.scopes, requiredScopesForAction(action))) {
    return;
  }
  if (isReadAction(action)) {
    throw new Error(`"${action}" needs email reading — use "Enable email reading" in Settings.`);
  }
  throw new Error("Reconnect Gmail in Settings to grant sending permission.");
}

export async function executeGmailAction(
  ctx: IntegrationContext,
  nodeId: string,
  fields: ResolvedGmailFields,
  parents: ParentNodeMetadata[]
): Promise<GmailActionResult> {
  const { action } = fields;

  if (isReadAction(action) && !gmailReadActionsEnabled()) {
    throw new Error("Email reading actions are currently disabled.");
  }

  consumeRunAction(ctx);
  const access = await getGmailAccessToken(ctx.supabase, ctx.userId);
  assertScopes(access, action);

  if (action === "Send Email") {
    await checkGmailSendQuota(ctx.supabase, ctx.userId);
    return runMutating(ctx, nodeId, "gmail.send", "gmail.send.attempted", async () => {
      const raw = buildMimeMessage({
        to: fields.to ?? "",
        subject: fields.subject,
        body: fields.body ?? ""
      });
      const sent = await gmailFetch<{ id: string }>(access.token, "/messages/send", {
        method: "POST",
        body: { raw }
      });
      const recipients = parseRecipients(fields.to ?? "").join(", ");
      return {
        output: JSON.stringify(
          { status: "Email sent", to: recipients, subject: fields.subject?.trim() || "(no subject)" },
          null,
          2
        ),
        externalResultId: sent.id
      };
    });
  }

  if (action === "Create Draft") {
    return runMutating(ctx, nodeId, "gmail.draft", "gmail.draft.attempted", async () => {
      const raw = buildMimeMessage({
        to: fields.to ?? "",
        subject: fields.subject,
        // Drafts may be empty — the user finishes them in Gmail.
        body: fields.body ?? ""
      });
      const draft = await gmailFetch<{ id: string }>(access.token, "/drafts", {
        method: "POST",
        body: { message: { raw } }
      });
      const recipients = parseRecipients(fields.to ?? "").join(", ");
      return {
        output: JSON.stringify(
          { status: "Draft created", to: recipients, subject: fields.subject?.trim() || "(no subject)" },
          null,
          2
        ),
        externalResultId: draft.id
      };
    });
  }

  if (action === "Reply to Email") {
    const ref = findUpstreamEmailRef(parents, "Reply to Email");
    await checkGmailSendQuota(ctx.supabase, ctx.userId);
    return runMutating(ctx, nodeId, "gmail.reply", "gmail.reply.attempted", async () => {
      const original = await gmailFetch<GmailMessage>(
        access.token,
        `/messages/${ref.messageId}?format=metadata` +
          "&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Reply-To"
      );
      const headers = original.payload?.headers;
      const originalMessageId = headerValue(headers, "Message-ID");
      const originalSubject = headerValue(headers, "Subject");
      const replySource = headerValue(headers, "Reply-To") || headerValue(headers, "From");

      let recipient: string;
      if (fields.replyTo?.trim()) {
        recipient = fields.replyTo.trim();
      } else {
        try {
          recipient = parseRecipients(replySource)[0];
        } catch {
          throw new Error(
            "Couldn't determine who to reply to — enter a recipient in the Reply To field."
          );
        }
      }

      const subject = /^re:/i.test(originalSubject)
        ? originalSubject
        : `Re: ${originalSubject}`.trim();

      const raw = buildMimeMessage({
        to: recipient,
        subject,
        body: fields.body ?? "",
        inReplyTo: originalMessageId || undefined,
        references: originalMessageId || undefined
      });

      const sent = await gmailFetch<{ id: string }>(access.token, "/messages/send", {
        method: "POST",
        body: { raw, threadId: ref.threadId }
      });

      return {
        output: JSON.stringify(
          { status: "Reply sent", to: parseRecipients(recipient).join(", "), subject },
          null,
          2
        ),
        externalResultId: sent.id
      };
    });
  }

  if (action === "Find Emails") {
    const query = fields.query?.trim() ?? "";
    if (!query) {
      throw new Error("Find Emails needs a search query.");
    }
    const maxResults = Math.min(Math.max(fields.maxResults ?? 5, 1), 10);

    const list = await gmailFetch<GmailMessageList>(
      access.token,
      `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
    );
    const ids = list.messages ?? [];

    const details = await mapWithConcurrency(ids, FIND_CONCURRENCY, (message) =>
      gmailFetch<GmailMessage>(
        access.token,
        `/messages/${message.id}?format=metadata` +
          "&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date"
      )
    );

    const emails = details.map((message) => ({
      from: headerValue(message.payload?.headers, "From"),
      subject: headerValue(message.payload?.headers, "Subject"),
      preview: message.snippet ?? "",
      receivedAt: toIsoDate(message.internalDate)
    }));

    const metadata: GmailNodeMetadata = {
      gmail: {
        emails: details.map((message) => ({
          messageId: message.id,
          threadId: message.threadId
        }))
      }
    };

    return {
      output: JSON.stringify(
        {
          status: `${emails.length} email${emails.length === 1 ? "" : "s"} found`,
          query,
          count: emails.length,
          emails
        },
        null,
        2
      ),
      metadata: metadata as Record<string, unknown>
    };
  }

  // Read Email
  const ref = findUpstreamEmailRef(parents, "Read Email");
  const message = await gmailFetch<GmailMessage>(
    access.token,
    `/messages/${ref.messageId}?format=full`
  );
  const headers = message.payload?.headers;

  const metadata: GmailNodeMetadata = {
    gmail: { messageId: message.id, threadId: message.threadId }
  };

  return {
    output: JSON.stringify(
      {
        status: "Email read",
        from: headerValue(headers, "From"),
        to: headerValue(headers, "To"),
        subject: headerValue(headers, "Subject"),
        receivedAt: toIsoDate(message.internalDate),
        body: extractBody(message.payload)
      },
      null,
      2
    ),
    metadata: metadata as Record<string, unknown>
  };
}
