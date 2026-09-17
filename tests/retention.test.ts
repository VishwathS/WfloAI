import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  LEDGER_UNSETTLED_FLOOR_DAYS,
  RETENTION_DAYS,
  retentionCleanupEnabled
} from "@/lib/retention/constants";
import {
  cutoffIso,
  isExpiredAuditEvent,
  isExpiredLedgerRow,
  isExpiredRun
} from "@/lib/retention/plan";
import { readPaging } from "@/app/api/workflows/[id]/runs/route";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

describe("run retention boundaries", () => {
  test("a 91-day-old run is deleted", () => {
    expect(isExpiredRun(daysAgo(91), NOW)).toBe(true);
  });

  test("an 89-day-old run is not", () => {
    expect(isExpiredRun(daysAgo(89), NOW)).toBe(false);
  });

  test("a run exactly at the boundary is kept, not deleted", () => {
    // Off-by-one here deletes a day of history nobody asked to lose.
    expect(isExpiredRun(daysAgo(RETENTION_DAYS.WORKFLOW_RUNS), NOW)).toBe(false);
  });
});

describe("audit retention boundaries", () => {
  test("91 days old is deleted, 89 is not", () => {
    expect(isExpiredAuditEvent(daysAgo(91), NOW)).toBe(true);
    expect(isExpiredAuditEvent(daysAgo(89), NOW)).toBe(false);
  });
});

describe("ledger retention protects unsettled rows", () => {
  test("a pending row 3 days old is NOT deleted", () => {
    // The case the task names. A pending row is evidence that an external
    // action may already have happened; deleting it destroys the only thing
    // that stops a retry re-sending an email.
    expect(
      isExpiredLedgerRow(
        { status: "pending", created_at: daysAgo(3), updated_at: daysAgo(3) },
        NOW
      )
    ).toBe(false);
  });

  test("an unknown row 3 days old is NOT deleted either", () => {
    expect(
      isExpiredLedgerRow(
        { status: "unknown", created_at: daysAgo(3), updated_at: daysAgo(3) },
        NOW
      )
    ).toBe(false);
  });

  test("the unsettled period never dips below the 7-day floor", () => {
    expect(RETENTION_DAYS.LEDGER_UNSETTLED).toBeGreaterThanOrEqual(
      LEDGER_UNSETTLED_FLOOR_DAYS
    );
  });

  test("a pending row past the full period is deleted", () => {
    expect(
      isExpiredLedgerRow(
        { status: "pending", created_at: daysAgo(31), updated_at: daysAgo(31) },
        NOW
      )
    ).toBe(true);
  });
});

describe("settled ledger rows are measured from settlement", () => {
  test("created long ago but settled yesterday is kept", () => {
    // A row that sat pending for months and then succeeded is one day old for
    // retention purposes. Measuring from created_at would delete the record of
    // an external action that happened yesterday.
    expect(
      isExpiredLedgerRow(
        { status: "succeeded", created_at: daysAgo(200), updated_at: daysAgo(1) },
        NOW
      )
    ).toBe(false);
  });

  test("settled 31 days ago is deleted", () => {
    expect(
      isExpiredLedgerRow(
        { status: "failed", created_at: daysAgo(60), updated_at: daysAgo(31) },
        NOW
      )
    ).toBe(true);
  });

  test("an unrecognised status is kept", () => {
    // A sweep must never be the thing that decides what an unknown state means.
    expect(
      isExpiredLedgerRow(
        { status: "something-new", created_at: daysAgo(400), updated_at: daysAgo(400) },
        NOW
      )
    ).toBe(false);
  });
});

describe("the sweep is fail-closed", () => {
  test("it refuses to run unless explicitly enabled", () => {
    const original = process.env.RETENTION_CLEANUP_ENABLED;
    try {
      delete process.env.RETENTION_CLEANUP_ENABLED;
      expect(retentionCleanupEnabled()).toBe(false);

      process.env.RETENTION_CLEANUP_ENABLED = "TRUE";
      expect(retentionCleanupEnabled()).toBe(false);

      process.env.RETENTION_CLEANUP_ENABLED = "true";
      expect(retentionCleanupEnabled()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.RETENTION_CLEANUP_ENABLED;
      else process.env.RETENTION_CLEANUP_ENABLED = original;
    }
  });

  test("the cleanup function checks the flag before touching anything", () => {
    // This working copy has a live Supabase CLI project link, so a local
    // Inngest dev server would otherwise sweep a remote database.
    const source = readFileSync(
      new URL("../lib/inngest/functions.ts", import.meta.url),
      "utf8"
    );
    const body = source.split("cleanup-expired-data")[1] ?? "";

    expect(body.indexOf("retentionCleanupEnabled()")).toBeGreaterThan(-1);
    expect(body.indexOf("retentionCleanupEnabled()")).toBeLessThan(body.indexOf(".delete()"));
  });
});

describe("cutoffIso", () => {
  test("is exactly N days before the reference time", () => {
    expect(cutoffIso(90, NOW)).toBe(new Date(NOW.getTime() - 90 * DAY_MS).toISOString());
  });
});

describe("runs pagination", () => {
  function request(query: string): Request {
    return new Request(`https://example.test/api/workflows/abc/runs${query}`);
  }

  test("defaults to a bounded page rather than every row ever produced", () => {
    expect(readPaging(request(""))).toEqual({ limit: 50, offset: 0 });
  });

  test("honours limit and offset", () => {
    expect(readPaging(request("?limit=10&offset=30"))).toEqual({ limit: 10, offset: 30 });
  });

  test("clamps a limit that would defeat the point", () => {
    expect(readPaging(request("?limit=100000")).limit).toBe(100);
    expect(readPaging(request("?limit=0")).limit).toBe(1);
    expect(readPaging(request("?limit=-5")).limit).toBe(1);
  });

  test("ignores nonsense rather than failing", () => {
    expect(readPaging(request("?limit=abc&offset=xyz"))).toEqual({ limit: 50, offset: 0 });
    expect(readPaging(request("?offset=-10")).offset).toBe(0);
  });

  test("the query orders by id as a tiebreaker", () => {
    // Two runs can share created_at to the microsecond. Without a tiebreaker
    // the same row can appear on two pages, or on none.
    const source = readFileSync(
      new URL("../app/api/workflows/[id]/runs/route.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain('.order("created_at", { ascending: false })');
    expect(source).toContain('.order("id", { ascending: false })');
  });
});
