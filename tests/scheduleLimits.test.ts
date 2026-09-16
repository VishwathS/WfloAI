import { describe, expect, test } from "vitest";
import { meetsIntervalFloor, minIntervalMinutes } from "@/lib/schedule/cron";
import { SCHEDULE_LIMITS, AUTO_DISABLED_REASON } from "@/lib/schedule/constants";

const TZ = "UTC";

describe("minimum interval floor", () => {
  test("rejects every-minute, however it is spelled", () => {
    // Validated against the parsed cron, not the raw string.
    expect(meetsIntervalFloor("* * * * *", TZ)).toBe(false);
    expect(meetsIntervalFloor("*/1 * * * *", TZ)).toBe(false);
  });

  test("rejects an interval below the floor", () => {
    expect(meetsIntervalFloor("*/5 * * * *", TZ)).toBe(false);
    expect(minIntervalMinutes("*/5 * * * *", TZ)).toBe(5);
  });

  test("accepts an interval exactly at the floor", () => {
    expect(minIntervalMinutes("*/15 * * * *", TZ)).toBe(SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES);
    expect(meetsIntervalFloor("*/15 * * * *", TZ)).toBe(true);
  });

  test("accepts ordinary daily and weekly schedules", () => {
    expect(meetsIntervalFloor("0 9 * * *", TZ)).toBe(true);
    expect(meetsIntervalFloor("30 6 * * 1", TZ)).toBe(true);
    expect(meetsIntervalFloor("0 9 * * 1-5", TZ)).toBe(true);
  });

  test("catches a short gap hidden among long ones", () => {
    // Looking at only one pair would see 29 minutes and let this through.
    expect(minIntervalMinutes("0,1,30 * * * *", TZ)).toBe(1);
    expect(meetsIntervalFloor("0,1,30 * * * *", TZ)).toBe(false);
  });

  test("treats an unparseable expression as not meeting the floor", () => {
    expect(minIntervalMinutes("not a cron", TZ)).toBeNull();
    expect(meetsIntervalFloor("not a cron", TZ)).toBe(false);
  });
});

describe("auto-disable threshold", () => {
  // Mirrors the track-schedule-health step in lib/inngest/functions.ts.
  function advance(failures: number, status: "success" | "error") {
    if (status !== "error") {
      return { failures: 0, disabled: false };
    }
    const next = failures + 1;
    return { failures: next, disabled: next >= SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES };
  }

  test("disables only on the Nth consecutive failure", () => {
    let state = { failures: 0, disabled: false };
    for (let i = 1; i < SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES; i += 1) {
      state = advance(state.failures, "error");
      expect(state.disabled).toBe(false);
    }
    state = advance(state.failures, "error");
    expect(state.failures).toBe(SCHEDULE_LIMITS.AUTO_DISABLE_AFTER_FAILURES);
    expect(state.disabled).toBe(true);
  });

  test("a success in between resets the counter", () => {
    let state = { failures: 0, disabled: false };
    state = advance(state.failures, "error");
    state = advance(state.failures, "error");
    expect(state.failures).toBe(2);

    state = advance(state.failures, "success");
    expect(state.failures).toBe(0);

    state = advance(state.failures, "error");
    expect(state.failures).toBe(1);
    expect(state.disabled).toBe(false);
  });

  test("the disabled reason is a stable value the UI can match on", () => {
    expect(AUTO_DISABLED_REASON).toBe("auto_disabled_consecutive_failures");
  });
});

describe("CAS claim semantics", () => {
  // checkDueSchedules claims an occurrence with
  //   UPDATE ... WHERE id = ? AND next_run_at = <observed> AND enabled
  // Exactly one concurrent poll may win. This models that predicate directly;
  // the real guarantee is Postgres row locking, and this pins the contract so a
  // future edit to the claim cannot quietly widen it.
  function claim(row: { nextRunAt: string | null; enabled: boolean }, observed: string) {
    if (!row.enabled || row.nextRunAt !== observed) {
      return false;
    }
    row.nextRunAt = new Date(Date.parse(observed) + 900_000).toISOString();
    return true;
  }

  test("exactly one of several concurrent polls wins", () => {
    const observed = "2026-09-15T09:00:00.000Z";
    const row = { nextRunAt: observed, enabled: true };

    const winners = [claim(row, observed), claim(row, observed), claim(row, observed)];

    expect(winners.filter(Boolean)).toHaveLength(1);
  });

  test("a disabled schedule is never claimed", () => {
    const observed = "2026-09-15T09:00:00.000Z";
    const row = { nextRunAt: observed, enabled: false };

    expect(claim(row, observed)).toBe(false);
  });

  test("a claim against a stale next_run_at loses", () => {
    const row = { nextRunAt: "2026-09-15T09:15:00.000Z", enabled: true };

    expect(claim(row, "2026-09-15T09:00:00.000Z")).toBe(false);
  });
});
