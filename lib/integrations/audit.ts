import type { SupabaseClient } from "@supabase/supabase-js";

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
  } catch {
    // swallow — auditing is observability, not control flow
  }
}
