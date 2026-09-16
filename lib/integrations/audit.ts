import type { SupabaseClient } from "@supabase/supabase-js";
import { reportError } from "@/lib/observability/report";

export type AuditAction =
  | "gmail.connected"
  | "gmail.disconnected"
  | "gmail.reconnect_required"
  | "credential.created"
  | "credential.replaced"
  | "credential.deleted"
  | "gmail.send.attempted"
  | "gmail.draft.attempted"
  | "gmail.reply.attempted"
  | "http.request.attempted";

export type AuditResult = "succeeded" | "failed" | "blocked" | "unknown";

// Best-effort: an audit failure must never turn a successful external action
// into a reported failure (or trigger a retry that re-sends an email).
export async function recordAuditEvent(
  supabase: SupabaseClient,
  userId: string,
  action: AuditAction,
  result: AuditResult,
  resourceId?: string
): Promise<void> {
  try {
    await supabase.from("integration_audit_events").insert({
      user_id: userId,
      action,
      result,
      resource_id: resourceId ?? null
    });
  } catch (error) {
    // Never rethrow: auditing is observability, not control flow, and a failed
    // audit write must not turn a successful send into a reported failure.
    // Reported rather than swallowed, because a silent audit gap is the one
    // thing an audit log must not have.
    reportError("audit.write_failed", error, { userId, action, result });
  }
}
