import {
  LEDGER_UNSETTLED_FLOOR_DAYS,
  RETENTION_DAYS,
  SETTLED_LEDGER_STATUSES,
  UNSETTLED_LEDGER_STATUSES
} from "@/lib/retention/constants";

const DAY_MS = 86_400_000;

export function cutoffIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export interface LedgerRow {
  status: string;
  created_at: string;
  updated_at: string;
}

// Exposed as a predicate rather than only as a query so the boundaries this
// task asks about are testable without a database.
export function isExpiredRun(createdAtIso: string, now: Date = new Date()): boolean {
  return createdAtIso < cutoffIso(RETENTION_DAYS.WORKFLOW_RUNS, now);
}

export function isExpiredAuditEvent(createdAtIso: string, now: Date = new Date()): boolean {
  return createdAtIso < cutoffIso(RETENTION_DAYS.AUDIT_EVENTS, now);
}

export function isExpiredLedgerRow(row: LedgerRow, now: Date = new Date()): boolean {
  const ageDays = (now.getTime() - Date.parse(row.created_at)) / DAY_MS;

  if ((UNSETTLED_LEDGER_STATUSES as readonly string[]).includes(row.status)) {
    // The floor is absolute. A pending or unknown row is evidence that an
    // external action may already have happened, and deleting it destroys the
    // only thing that stops a retry re-sending an email.
    if (ageDays < LEDGER_UNSETTLED_FLOOR_DAYS) {
      return false;
    }

    return row.created_at < cutoffIso(RETENTION_DAYS.LEDGER_UNSETTLED, now);
  }

  if (!(SETTLED_LEDGER_STATUSES as readonly string[]).includes(row.status)) {
    // Unrecognised status: keep it. A sweep should never be the thing that
    // decides what an unknown state means.
    return false;
  }

  // Settled rows are measured from settlement, not creation: a row that sat
  // pending for a month and then succeeded is one day old for this purpose.
  return row.updated_at < cutoffIso(RETENTION_DAYS.LEDGER_SETTLED, now);
}
