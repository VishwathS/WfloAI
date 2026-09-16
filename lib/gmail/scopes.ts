import type { GmailActionType } from "@/lib/types";

// Central scope map — the only place Gmail scopes are defined.
//
// Google's classification (verify in the Cloud Console, not from prose):
//   gmail.send     — Sensitive
//   gmail.compose  — RESTRICTED
//   gmail.readonly — RESTRICTED
//
// A15: requesting ANY restricted scope at connect time puts the whole Gmail
// integration behind a CASA security assessment, not just the actions that use
// it. V1 therefore ships Send only.
export const GMAIL_SCOPES = {
  send: "https://www.googleapis.com/auth/gmail.send",
  compose: "https://www.googleapis.com/auth/gmail.compose",
  readonly: "https://www.googleapis.com/auth/gmail.readonly"
} as const;

export type GmailTier = "send" | "read";

// Incremental authorization. The initial connect requests gmail.send ONLY —
// no restricted scope. The "read" tier adds the restricted scopes and belongs
// to the deferred D1 program; it is unreachable while GMAIL_READ_ACTIONS_ENABLED
// is off.
export function scopesForTier(tier: GmailTier): string[] {
  return tier === "read"
    ? [GMAIL_SCOPES.send, GMAIL_SCOPES.compose, GMAIL_SCOPES.readonly]
    : [GMAIL_SCOPES.send];
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

// Every action that needs a RESTRICTED scope. These are hidden from the node
// dropdown and refused at execution while the feature flag is off. Create Draft
// is here because gmail.compose is restricted (A15) — not because it reads mail.
export function isRestrictedAction(action: GmailActionType): boolean {
  return action !== "Send Email";
}

// Narrower: actions that specifically need gmail.readonly, which is what the
// "Enable email reading" flow in Settings grants. Create Draft needs compose,
// so that flow cannot unblock it — the message must not suggest otherwise.
export function needsReadScope(action: GmailActionType): boolean {
  return action === "Find Emails" || action === "Read Email" || action === "Reply to Email";
}

// Feature flag: lets Send launch while restricted-scope verification is still
// pending. Server-only (read at execution + status). Defaults OFF — every
// restricted-scope action stays hidden and unexecutable unless explicitly opted
// in, so an unconfigured deploy never exposes an unverified restricted scope.
export function gmailReadActionsEnabled(): boolean {
  return process.env.GMAIL_READ_ACTIONS_ENABLED === "true";
}

export function hasScopes(granted: string[], required: string[]): boolean {
  return required.every((scope) => granted.includes(scope));
}
