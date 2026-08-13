import { isAllowedApiKeyHeader } from "@/lib/http/constants";
import type { CredentialSecret } from "@/lib/integrations/types";
import type { CredentialType } from "@/lib/types";

export interface CredentialPayload {
  name: string;
  type: CredentialType;
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  value?: string;
}

export function isCredentialPayload(value: unknown): value is CredentialPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    (v.type === "bearer" || v.type === "basic" || v.type === "api_key")
  );
}

// Returns the secret payload to encrypt, or a user-facing error string.
export function buildSecretPayload(payload: CredentialPayload): CredentialSecret | string {
  if (payload.type === "bearer") {
    if (!payload.token?.trim()) return "A bearer credential needs a token.";
    return { token: payload.token.trim() };
  }
  if (payload.type === "basic") {
    if (!payload.username?.trim() || !payload.password) {
      return "A basic auth credential needs a username and password.";
    }
    return { username: payload.username.trim(), password: payload.password };
  }
  const headerName = payload.headerName?.trim() ?? "";
  if (!headerName || !payload.value?.trim()) {
    return "An API key credential needs a header name and value.";
  }
  if (!isAllowedApiKeyHeader(headerName)) {
    return "That header name isn't allowed for API key credentials.";
  }
  return { headerName, value: payload.value.trim() };
}
