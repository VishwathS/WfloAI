// B2. The periods are one source of truth, shared by the cleanup function, its
// tests, and the retention wording in the privacy policy. Task 12 Completion
// Criteria require the numbers in the code and in the policy to be identical;
// keeping them in one place is how that stays true.
//
// PROPOSED, per this task's Stop Condition: the operator confirms them
// (Manual Step 1), and if the published policy ever states different numbers
// the policy wins until it is amended.
export const RETENTION_DAYS = {
  // Full per-node output text. The largest thing that grows without bound.
  WORKFLOW_RUNS: 90,
  // Who did what, when. No secret values are stored here.
  AUDIT_EVENTS: 90,
  // Idempotency ledger, measured from settlement rather than creation.
  LEDGER_SETTLED: 30,
  // Unsettled ledger rows have no settlement to measure from, so they are held
  // for the same period from creation instead of being swept early.
  LEDGER_UNSETTLED: 30
} as const;

// CLAUDE.md's rule, and the reason for it: a pending or unknown row is evidence
// that an external action may already have happened. Deleting it destroys the
// only record that would stop a retry re-sending an email.
export const LEDGER_UNSETTLED_FLOOR_DAYS = 7;

// Uploaded files are kept until the user deletes them or deletes their account.
export const FILES_RETAINED_UNTIL_USER_DELETES = true;

export const SETTLED_LEDGER_STATUSES = ["succeeded", "failed"] as const;
export const UNSETTLED_LEDGER_STATUSES = ["pending", "unknown"] as const;

// Deleting real user data is an irreversible production data change. This
// working copy has a live Supabase CLI project link, so a local Inngest dev
// server would otherwise sweep a REMOTE database. Default off; the operator
// turns it on in the environment where deletion is actually intended.
export function retentionCleanupEnabled(): boolean {
  return process.env.RETENTION_CLEANUP_ENABLED === "true";
}
