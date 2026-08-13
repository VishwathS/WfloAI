import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimAction,
  markActionFailed,
  markActionSucceeded,
  markActionUnknown
} from "@/lib/integrations/idempotency";
import type { IntegrationContext } from "@/lib/integrations/types";

// Minimal in-memory stand-in for the integration_action_executions table. The
// only behavior that matters is the UNIQUE constraint on idempotency_key —
// that is what makes the claim atomic in Postgres.
interface FakeRow {
  id: string;
  idempotency_key: string;
  status: "pending" | "succeeded" | "failed" | "unknown";
  result_output: string | null;
  result_metadata: Record<string, unknown> | null;
  external_result_id: string | null;
}

interface QueryState {
  op: "upsert" | "update" | "select";
  values: Record<string, unknown>;
  ignoreDuplicates: boolean;
  filters: Array<{ column: string; value: unknown }>;
  single: boolean;
}

function createFakeLedger(seed: Partial<FakeRow>[] = []) {
  let nextId = 1;
  const rows: FakeRow[] = seed.map((row) => ({
    id: String(nextId++),
    idempotency_key: "",
    status: "pending",
    result_output: null,
    result_metadata: null,
    external_result_id: null,
    ...row
  }));

  const failures = { update: false };

  function matches(row: FakeRow, filters: QueryState["filters"]): boolean {
    return filters.every((f) => (row as unknown as Record<string, unknown>)[f.column] === f.value);
  }

  function run(state: QueryState) {
    if (state.op === "upsert") {
      const key = state.values.idempotency_key as string;
      const existing = rows.find((row) => row.idempotency_key === key);
      if (existing) {
        // ignoreDuplicates: the conflicting insert is skipped, returning no rows.
        return { data: state.ignoreDuplicates ? [] : [{ id: existing.id }], error: null };
      }
      const inserted: FakeRow = {
        id: String(nextId++),
        idempotency_key: key,
        status: (state.values.status as FakeRow["status"]) ?? "pending",
        result_output: null,
        result_metadata: null,
        external_result_id: null
      };
      rows.push(inserted);
      return { data: [{ id: inserted.id }], error: null };
    }

    if (state.op === "update") {
      if (failures.update) {
        return { data: null, error: { message: "connection reset" } };
      }
      const hits = rows.filter((row) => matches(row, state.filters));
      for (const row of hits) {
        Object.assign(row, state.values);
      }
      return { data: hits.map((row) => ({ id: row.id })), error: null };
    }

    const hits = rows.filter((row) => matches(row, state.filters));
    if (state.single) {
      return { data: hits[0] ?? null, error: null };
    }
    return { data: hits, error: null };
  }

  function from() {
    const state: QueryState = {
      op: "select",
      values: {},
      ignoreDuplicates: false,
      filters: [],
      single: false
    };

    const builder = {
      upsert(values: Record<string, unknown>, options?: { ignoreDuplicates?: boolean }) {
        state.op = "upsert";
        state.values = values;
        state.ignoreDuplicates = options?.ignoreDuplicates ?? false;
        return builder;
      },
      update(values: Record<string, unknown>) {
        state.op = "update";
        state.values = values;
        return builder;
      },
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, value });
        return builder;
      },
      maybeSingle() {
        state.single = true;
        return builder;
      },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        try {
          resolve(run(state));
        } catch (error) {
          reject(error);
        }
      }
    };

    return builder;
  }

  return { rows, failures, client: { from } as unknown as SupabaseClient };
}

function createContext(client: SupabaseClient): IntegrationContext {
  return {
    supabase: client,
    userId: "user-1",
    workflowId: "workflow-1",
    runId: "run-1",
    actionsUsed: { count: 0 }
  };
}

describe("claimAction", () => {
  it("lets the first caller execute", async () => {
    const ledger = createFakeLedger();
    const outcome = await claimAction(createContext(ledger.client), "node-1", "gmail.send");

    expect(outcome.kind).toBe("execute");
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].idempotency_key).toBe("run-1:node-1");
    expect(ledger.rows[0].status).toBe("pending");
  });

  it("blocks a concurrent second caller while the first is still pending", async () => {
    const ledger = createFakeLedger();
    const ctx = createContext(ledger.client);

    const first = await claimAction(ctx, "node-1", "gmail.send");
    const second = await claimAction(ctx, "node-1", "gmail.send");

    expect(first.kind).toBe("execute");
    expect(second.kind).toBe("blocked");
    if (second.kind === "blocked") {
      expect(second.message).toContain("may have already run");
    }
    expect(ledger.rows).toHaveLength(1);
  });

  it("replays a succeeded action instead of re-executing it", async () => {
    const ledger = createFakeLedger([
      {
        idempotency_key: "run-1:node-1",
        status: "succeeded",
        result_output: '{"status":"Email sent"}',
        result_metadata: { gmail: { messageId: "m-1" } }
      }
    ]);

    const outcome = await claimAction(createContext(ledger.client), "node-1", "gmail.send");

    expect(outcome.kind).toBe("replay");
    if (outcome.kind === "replay") {
      expect(outcome.output).toBe('{"status":"Email sent"}');
      expect(outcome.metadata).toEqual({ gmail: { messageId: "m-1" } });
    }
  });

  it("never auto-retries an ambiguous (unknown) outcome", async () => {
    const ledger = createFakeLedger([{ idempotency_key: "run-1:node-1", status: "unknown" }]);

    const outcome = await claimAction(createContext(ledger.client), "node-1", "gmail.send");

    expect(outcome.kind).toBe("blocked");
    expect(ledger.rows[0].status).toBe("unknown");
  });

  it("lets exactly one racer reclaim a failed action", async () => {
    const ledger = createFakeLedger([{ idempotency_key: "run-1:node-1", status: "failed" }]);
    const ctx = createContext(ledger.client);

    const first = await claimAction(ctx, "node-1", "gmail.send");
    const second = await claimAction(ctx, "node-1", "gmail.send");

    expect(first.kind).toBe("execute");
    expect(second.kind).toBe("blocked");
  });

  it("scopes the claim to the node, so sibling nodes in one run claim independently", async () => {
    const ledger = createFakeLedger();
    const ctx = createContext(ledger.client);

    const a = await claimAction(ctx, "node-a", "gmail.send");
    const b = await claimAction(ctx, "node-b", "gmail.send");

    expect(a.kind).toBe("execute");
    expect(b.kind).toBe("execute");
    expect(ledger.rows.map((row) => row.idempotency_key)).toEqual([
      "run-1:node-a",
      "run-1:node-b"
    ]);
  });

  it("scopes the claim to the run, so a genuinely new run re-executes", async () => {
    const ledger = createFakeLedger([
      { idempotency_key: "run-1:node-1", status: "succeeded", result_output: "sent" }
    ]);

    const replayed = await claimAction(createContext(ledger.client), "node-1", "gmail.send");
    const freshRun = await claimAction(
      { ...createContext(ledger.client), runId: "run-2" },
      "node-1",
      "gmail.send"
    );

    expect(replayed.kind).toBe("replay");
    expect(freshRun.kind).toBe("execute");
  });
});

describe("ledger status writes", () => {
  it("records output and metadata on success", async () => {
    const ledger = createFakeLedger();
    const ctx = createContext(ledger.client);
    await claimAction(ctx, "node-1", "gmail.send");

    await markActionSucceeded(ledger.client, "run-1", "node-1", {
      output: '{"status":"Email sent"}',
      metadata: { gmail: { messageId: "m-1" } },
      externalResultId: "m-1"
    });

    expect(ledger.rows[0].status).toBe("succeeded");
    expect(ledger.rows[0].result_output).toBe('{"status":"Email sent"}');
    expect(ledger.rows[0].external_result_id).toBe("m-1");
  });

  it("throws when the success write fails, rather than silently leaving the row pending", async () => {
    const ledger = createFakeLedger();
    const ctx = createContext(ledger.client);
    await claimAction(ctx, "node-1", "gmail.send");
    ledger.failures.update = true;

    await expect(
      markActionSucceeded(ledger.client, "run-1", "node-1", { output: "sent" })
    ).rejects.toThrow(/couldn't record this action as completed/i);
  });

  it("marks failed and unknown without throwing", async () => {
    const ledger = createFakeLedger();
    const ctx = createContext(ledger.client);

    await claimAction(ctx, "node-1", "gmail.send");
    await markActionFailed(ledger.client, "run-1", "node-1");
    expect(ledger.rows[0].status).toBe("failed");

    await markActionUnknown(ledger.client, "run-1", "node-1");
    expect(ledger.rows[0].status).toBe("unknown");
  });
});
