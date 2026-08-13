import type { GmailActionType } from "@/lib/types";

// Central scope map — the only place Gmail scopes are defined.
// send/compose are "sensitive" scopes; readonly is RESTRICTED and requires
// Google restricted-scope verification before arbitrary users can grant it.
export const GMAIL_SCOPES = {
  send: "https://www.googleapis.com/auth/gmail.send",
  compose: "https://www.googleapis.com/auth/gmail.compose",
  readonly: "https://www.googleapis.com/auth/gmail.readonly"
} as const;

export type GmailTier = "send" | "read";

// Incremental authorization: the initial connect requests only send/compose;
// "Enable email reading" re-runs OAuth adding readonly with
// include_granted_scopes=true. Users who only send never grant read access.
export function scopesForTier(tier: GmailTier): string[] {
  return tier === "read"
    ? [GMAIL_SCOPES.send, GMAIL_SCOPES.compose, GMAIL_SCOPES.readonly]
    : [GMAIL_SCOPES.send, GMAIL_SCOPES.compose];
}

export function requiredScopesForAction(action: GmailActionType): string[] {
  switch (action) {
    case "Send Email":
      return [GMAIL_SCOPES.send];
    case "Create Draft":
      return [GMAIL_SCOPES.compose];
    case "Reply to Email":
      return [GMAIL_SCOPES.send, GMAIL_SCOPES.readonly];
    case "Find Emails":
    case "Read Email":
      return [GMAIL_SCOPES.readonly];
  }
}

export function isReadAction(action: GmailActionType): boolean {
  return action === "Find Emails" || action === "Read Email" || action === "Reply to Email";
}

// Feature flag: lets Send/Draft launch while restricted-scope verification for
// gmail.readonly is still pending. Server-only (read at execution + status).
// Defaults OFF — Find/Read/Reply stay hidden and unexecutable unless explicitly
// opted in, so an unconfigured deploy never exposes an unverified restricted scope.
export function gmailReadActionsEnabled(): boolean {
  return process.env.GMAIL_READ_ACTIONS_ENABLED === "true";
}

export function hasScopes(granted: string[], required: string[]): boolean {
  return required.every((scope) => granted.includes(scope));
}
