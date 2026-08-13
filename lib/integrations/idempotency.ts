import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationContext } from "@/lib/integrations/types";

export type ClaimOutcome =
  | { kind: "execute" }
  | { kind: "replay"; output: string; metadata: Record<string, unknown> | null }
  | { kind: "blocked"; message: string };

interface LedgerRow {
  status: "pending" | "succeeded" | "failed" | "unknown";
  result_output: string | null;
  result_metadata: Record<string, unknown> | null;
}

export function buildIdempotencyKey(runId: string, nodeId: string): string {
  return `${runId}:${nodeId}`;
}

// Deterministic UUID from an arbitrary seed (e.g. an Inngest event id) so
// function retries reuse the same runId — and therefore the same idempotency
// keys — instead of minting fresh ones.
export function deriveRunId(seed: string): string {
  const hash = createHash("sha256").update(seed).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const AMBIGUOUS_MESSAGE =
  "This action may have already run — check the destination before retrying.";

// Atomic claim: the unique idempotency_key + upsert-with-ignoreDuplicates means
// exactly one caller inserts the pending row; the failed→pending reclaim is a
// conditional UPDATE so concurrent retries resolve to a single winner. Never a
// plain read-then-update.
export async function claimAction(
  ctx: IntegrationContext,
  nodeId: string,
  actionType: string
): Promise<ClaimOutcome> {
  const key = buildIdempotencyKey(ctx.runId, nodeId);

  const { data: inserted, error: insertError } = await ctx.supabase
    .from("integration_action_executions")
    .upsert(
      {
        user_id: ctx.userId,
        workflow_id: ctx.workflowId,
        run_id: ctx.runId,
        node_id: nodeId,
        action_type: actionType,
        idempotency_key: key,
        status: "pending"
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    )
    .select("id");

  if (insertError) {
    throw new Error(`Couldn't reserve this action for execution: ${insertError.message}`);
  }

  if (inserted && inserted.length > 0) {
    return { kind: "execute" };
  }

  const { data: existing, error: readError } = await ctx.supabase
    .from("integration_action_executions")
    .select("status, result_output, result_metadata")
    .eq("idempotency_key", key)
    .maybeSingle();

  if (readError || !existing) {
    return { kind: "blocked", message: AMBIGUOUS_MESSAGE };
  }

  const row = existing as LedgerRow;

  if (row.status === "succeeded") {
    return {
      kind: "replay",
      output: row.result_output ?? "",
      metadata: row.result_metadata
    };
  }

  if (row.status === "failed") {
    const { data: reclaimed } = await ctx.supabase
      .from("integration_action_executions")
      .update({ status: "pending" })
      .eq("idempotency_key", key)
      .eq("status", "failed")
      .select("id");

    if (reclaimed && reclaimed.length > 0) {
      return { kind: "execute" };
    }
  }

  return { kind: "blocked", message: AMBIGUOUS_MESSAGE };
}

export interface ActionSuccess {
  output: string;
  metadata?: Record<string, unknown>;
  externalResultId?: string;
}

// result.output must already be redacted — the ledger stores replayable node
// output and must never contain tokens, credentials, or raw responses.
//
// Throws on write failure: a lost success write leaves the row `pending`, which
// blocks the next retry of an action that already happened externally. That
// fails safe (never a duplicate send) but is otherwise invisible, so surface it.
export async function markActionSucceeded(
  supabase: SupabaseClient,
  runId: string,
  nodeId: string,
  result: ActionSuccess
): Promise<void> {
  const { error } = await supabase
    .from("integration_action_executions")
    .update({
      status: "succeeded",
      result_output: result.output,
      result_metadata: result.metadata ?? null,
      external_result_id: result.externalResultId ?? null
    })
    .eq("idempotency_key", buildIdempotencyKey(runId, nodeId));

  if (error) {
    throw new Error(`Couldn't record this action as completed: ${error.message}`);
  }
}

export async function markActionFailed(
  supabase: SupabaseClient,
  runId: string,
  nodeId: string
): Promise<void> {
  await supabase
    .from("integration_action_executions")
    .update({ status: "failed" })
    .eq("idempotency_key", buildIdempotencyKey(runId, nodeId));
}

// Ambiguous outcome (e.g. timeout after the request may have reached the
// provider). The action is never auto-retried from this state.
export async function markActionUnknown(
  supabase: SupabaseClient,
  runId: string,
  nodeId: string
): Promise<void> {
  await supabase
    .from("integration_action_executions")
    .update({ status: "unknown" })
    .eq("idempotency_key", buildIdempotencyKey(runId, nodeId));
}
