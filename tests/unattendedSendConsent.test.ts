import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GmailActionType } from "@/lib/types";
import {
  disableUnauthorizedSendSchedules,
  hasUnattendedSendConsent,
  requiresUnattendedSendConsent
} from "@/lib/schedule/consent";
import { UNATTENDED_SEND_DISABLED_REASON } from "@/lib/schedule/constants";
import { RETENTION_DAYS } from "@/lib/retention/constants";

// S1 + S2 cross-task remediation.
//
// S1: consent was checked when a schedule was enabled, but schedules execute the
// LATEST saved graph — so adding a Gmail Send step afterwards started unattended
// sending on an authorisation nobody gave.
// S2: the authorisation lived only in integration_audit_events, which task 12
// sweeps after 90 days, so the application would forget it was ever given.

function gmailNode(action: GmailActionType) {
  return { type: "gmailNode", data: { label: "Gmail", action } };
}

const aiNode = { type: "aiNode", data: { label: "Summarize" } };

interface UpdateCapture {
  values?: Record<string, unknown>;
  filters: [string, unknown][];
  rows: { id: string }[];
  error: { message: string } | null;
}

function fakeSupabase(capture: UpdateCapture): SupabaseClient {
  return {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        capture.values = values;
        const chain = {
          eq: (column: string, value: unknown) => {
            capture.filters.push([column, value]);
            return chain;
          },
          is: (column: string, value: unknown) => {
            capture.filters.push([column, value]);
            return chain;
          },
          select: async () => ({ data: capture.rows, error: capture.error })
        };
        return chain;
      }
    })
  } as unknown as SupabaseClient;
}

function capture(
  rows: { id: string }[] = [],
  error: { message: string } | null = null
): UpdateCapture {
  return { filters: [], rows, error };
}

describe("a schedule enabled without Gmail Send", () => {
  test("needs no consent", () => {
    expect(requiresUnattendedSendConsent(true, [aiNode])).toBe(false);
  });

  test("and carries no authorisation, which is the safe default", () => {
    expect(hasUnattendedSendConsent({})).toBe(false);
    expect(hasUnattendedSendConsent({ unattended_send_authorized_at: null })).toBe(false);
  });

  test("a graph edit that does not introduce sending disables nothing", async () => {
    const seen = capture([{ id: "s-1" }]);

    await expect(
      disableUnauthorizedSendSchedules(fakeSupabase(seen), "wf-1", [aiNode])
    ).resolves.toBe(0);
    // Not merely zero disabled — no UPDATE was issued at all.
    expect(seen.values).toBeUndefined();
  });
});

describe("Gmail Send introduced later", () => {
  test("disables the enabled schedules that lack authorisation", async () => {
    const seen = capture([{ id: "s-1" }, { id: "s-2" }]);

    const disabled = await disableUnauthorizedSendSchedules(fakeSupabase(seen), "wf-1", [
      aiNode,
      gmailNode("Send Email")
    ]);

    expect(disabled).toBe(2);
    expect(seen.values).toMatchObject({
      enabled: false,
      next_run_at: null,
      disabled_reason: UNATTENDED_SEND_DISABLED_REASON
    });
  });

  test("touches only this workflow, only enabled rows, only unauthorised ones", async () => {
    const seen = capture([{ id: "s-1" }]);

    await disableUnauthorizedSendSchedules(fakeSupabase(seen), "wf-1", [
      gmailNode("Send Email")
    ]);

    expect(seen.filters).toEqual([
      ["workflow_id", "wf-1"],
      ["enabled", true],
      ["unattended_send_authorized_at", null]
    ]);
  });

  test("Reply to Email counts as sending too", async () => {
    const seen = capture([{ id: "s-1" }]);

    await expect(
      disableUnauthorizedSendSchedules(fakeSupabase(seen), "wf-1", [
        gmailNode("Reply to Email")
      ])
    ).resolves.toBe(1);
  });

  test("an already-authorised schedule is left running", async () => {
    // It is excluded by the is(null) filter, and the predicate agrees.
    expect(
      requiresUnattendedSendConsent(true, [gmailNode("Send Email")], {
        unattended_send_authorized_at: "2026-09-16T00:00:00.000Z"
      })
    ).toBe(false);
  });

  test("a sweep failure is surfaced, not counted as success", async () => {
    const seen = capture([], { message: "denied" });

    await expect(
      disableUnauthorizedSendSchedules(fakeSupabase(seen), "wf-1", [gmailNode("Send Email")])
    ).rejects.toThrow(/denied/);
  });
});

describe("re-enabling requires explicit re-confirmation", () => {
  test("a disabled, unauthorised, send-capable schedule asks again", () => {
    expect(
      requiresUnattendedSendConsent(true, [gmailNode("Send Email")], {
        unattended_send_authorized_at: null
      })
    ).toBe(true);
  });

  test("the enable route writes the authorisation only on an explicit ack", () => {
    const source = readFileSync(
      new URL("../app/api/workflows/[id]/schedules/[scheduleId]/route.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("body.unattended_send_ack !== true");
    expect(source).toContain("authorizedAt = new Date().toISOString();");
    // Written only when set, so an unrelated PATCH cannot clear or forge it.
    expect(source).toContain(
      "...(authorizedAt ? { unattended_send_authorized_at: authorizedAt } : {})"
    );
  });

  test("creation stores it only for a confirmed, enabled, send-capable schedule", () => {
    const source = readFileSync(
      new URL("../app/api/workflows/[id]/schedules/route.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("body.unattended_send_ack === true");
    expect(source).toContain("containsSendCapableGmailNode(graph.nodes)");
  });
});

describe("no unattended send can occur before re-confirmation", () => {
  const runner = readFileSync(new URL("../lib/inngest/functions.ts", import.meta.url), "utf8");

  test("the runner refuses a send-capable schedule that lacks authorisation", () => {
    expect(runner).toContain("hasUnattendedSendConsent");
    expect(runner).toContain("containsSendCapableGmailNode(nodes)");
  });

  test("and it checks before the workflow is executed", () => {
    // The graph-save sweep and a due occurrence can race, so this is the check
    // that actually stands between an unauthorised schedule and real email.
    expect(runner.indexOf("hasUnattendedSendConsent")).toBeLessThan(
      runner.indexOf("runWorkflowToCompletion(rfNodes")
    );
  });

  test("the refusal is visible, not a silent skip", () => {
    // A silent skip is what makes a dead schedule invisible: no run row, no
    // failure count, no report. The refusal persists an error run instead.
    const guard = runner.split("containsSendCapableGmailNode(nodes)")[1] ?? "";
    expect(guard).toContain("validationErrorRun");
    expect(guard).toContain("UNATTENDED_SEND_DISABLED_REASON");
  });

  test("the graph save sweeps schedules after persisting the edit", () => {
    const source = readFileSync(
      new URL("../app/api/workflows/[id]/route.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("disableUnauthorizedSendSchedules");
  });
});

describe("retention cannot erase the operative consent", () => {
  const functions = readFileSync(new URL("../lib/inngest/functions.ts", import.meta.url), "utf8");
  const sweep = functions.split("cleanup-expired-data")[1] ?? "";

  test("the sweep never touches workflow_schedules", () => {
    expect(sweep).not.toContain("workflow_schedules");
  });

  test("it deletes from exactly the three record tables", () => {
    expect(sweep).toContain("workflow_runs");
    expect(sweep).toContain("integration_audit_events");
    expect(sweep).toContain("integration_action_executions");
  });

  test("so deleting the audit event leaves the authorisation intact", () => {
    // The audit row is historical evidence of who confirmed and when; the
    // schedule column is what the application consults. Before this change the
    // two were the same thing, and the 90-day sweep erased the answer.
    expect(RETENTION_DAYS.AUDIT_EVENTS).toBe(90);
    expect(
      hasUnattendedSendConsent({ unattended_send_authorized_at: "2020-01-01T00:00:00.000Z" })
    ).toBe(true);
  });
});
