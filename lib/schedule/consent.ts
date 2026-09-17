import { containsSendCapableGmailNode } from "@/lib/execution/validate";

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

export function requiresUnattendedSendConsent(
  enabled: boolean,
  nodes: ReadonlyArray<{ type?: string; data?: unknown }>
): boolean {
  return enabled && containsSendCapableGmailNode(nodes);
}
