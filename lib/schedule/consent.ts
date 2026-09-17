import type { SupabaseClient } from "@supabase/supabase-js";
import { containsSendCapableGmailNode } from "@/lib/execution/validate";
import { UNATTENDED_SEND_DISABLED_REASON } from "@/lib/schedule/constants";

// A14a. Enabling a schedule on a send-capable graph is the moment a user
// authorises real mail leaving their account with nobody present. The node
// already warns that a run sends real email; that is awareness. This is
// authorisation, at a different moment, with different consequences.
//
// Friction belongs on the irreversible action only: a schedule on a graph that
// cannot send needs no consent, and a schedule being created or left disabled
// needs none either.
export const UNATTENDED_SEND_CONSENT_CODE = "unattended_send_consent_required";

export const UNATTENDED_SEND_CONSENT_MESSAGE =
  "This workflow sends real email from your connected Gmail account. Enabling a schedule lets it send automatically, on its own, without you present. Confirm to continue.";

type GraphNodes = ReadonlyArray<{ type?: string; data?: unknown }>;

interface ConsentBearingSchedule {
  unattended_send_authorized_at?: string | null;
}

// The operative authorisation, read from the schedule rather than inferred from
// an audit event — retention deletes those after 90 days, and a schedule must
// not become unauthorised (or stay authorised) as a side effect of a sweep.
export function hasUnattendedSendConsent(schedule: ConsentBearingSchedule): boolean {
  return typeof schedule.unattended_send_authorized_at === "string";
}

// Whether this enable needs an explicit confirmation now. A schedule that
// already carries authorisation does not re-ask: the user authorised unattended
// sending for this schedule, and that authorisation is cleared whenever the
// workflow changes in a way that would newly make it send.
export function requiresUnattendedSendConsent(
  enabled: boolean,
  nodes: GraphNodes,
  schedule: ConsentBearingSchedule = {}
): boolean {
  if (!enabled || !containsSendCapableGmailNode(nodes)) {
    return false;
  }

  return !hasUnattendedSendConsent(schedule);
}

// Closes the gap between "consent is checked when a schedule is enabled" and
// "schedules execute the latest saved graph". Enable a schedule on a workflow
// that cannot send, then add a Gmail Send step, and that schedule would begin
// sending unattended on an authorisation nobody gave.
//
// Called after a graph is saved. Disables only ENABLED schedules that lack
// authorisation, and only when the saved graph can actually send. Re-enabling
// goes back through the consent gate, so nothing here infers consent — it only
// withdraws automation that never had it.
export async function disableUnauthorizedSendSchedules(
  supabase: SupabaseClient,
  workflowId: string,
  nodes: GraphNodes
): Promise<number> {
  if (!containsSendCapableGmailNode(nodes)) {
    return 0;
  }

  const { data, error } = await supabase
    .from("workflow_schedules")
    .update({
      enabled: false,
      next_run_at: null,
      disabled_reason: UNATTENDED_SEND_DISABLED_REASON
    })
    .eq("workflow_id", workflowId)
    .eq("enabled", true)
    .is("unattended_send_authorized_at", null)
    .select("id");

  if (error) {
    throw new Error(`Failed to disable unauthorized send schedules: ${error.message}`);
  }

  return (data ?? []).length;
}
