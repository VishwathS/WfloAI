// A12 — schedule abuse and reliability limits.
//
// Values marked PROPOSED are product judgment the audit does not fully supply;
// Task 05's Stop Conditions make them an operator decision ("propose and ask"),
// and Manual Steps 1 and 2 are where the confirmed values get recorded.
export const SCHEDULE_LIMITS = {
  // The audit's suggestion for V1. A `* * * * *` schedule is 1,440 runs a day
  // against the operator's shared key; the poller's global .limit(50) is a
  // throughput ceiling, not a per-user quota, and must not be read as one.
  MIN_INTERVAL_MINUTES: 15,

  // PROPOSED.
  MAX_SCHEDULES_PER_USER: 20,
  MAX_SCHEDULES_PER_WORKFLOW: 5,

  // PROPOSED. Low enough to stop a broken automation quickly, high enough to
  // ride out a transient provider outage.
  AUTO_DISABLE_AFTER_FAILURES: 5
} as const;

export const AUTO_DISABLED_REASON = "auto_disabled_consecutive_failures";

// A14a cross-task remediation. A schedule enabled on a workflow that could not
// send mail carries no unattended-send consent. If the workflow is later edited
// to add a Gmail Send step, that schedule would begin sending unattended on
// authorisation nobody ever gave. It is disabled instead, and re-enabling it
// goes through the normal consent gate.
export const UNATTENDED_SEND_DISABLED_REASON = "disabled_unattended_send_unconsented";
