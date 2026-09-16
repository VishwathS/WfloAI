import type { SupabaseClient } from "@supabase/supabase-js";

export type MeteredActionType = "ai.call" | "lookup.search";

export interface QuotaWindow {
  perMinute: number;
  perDay: number;
}

export interface MeteredContext {
  // Required on the service-role path, where auth.uid() is null. Ignored (and
  // rejected if it disagrees) when a user session is present.
  userId?: string;
  workflowId?: string;
  runId?: string;
  nodeId?: string;
}

export type QuotaOutcome =
  | { allowed: true; executionId: string }
  | { allowed: false; reason: "per_minute" | "per_day" | "unauthenticated"; limit?: number };

interface RpcResult {
  allowed: boolean;
  reason?: "per_minute" | "per_day" | "unauthenticated";
  limit?: number;
  execution_id?: string;
}

// Atomic check-and-consume against integration_action_executions (B11). The
// count and the insert happen inside one advisory-locked statement in
// consume_action_quota, so two concurrent requests at the boundary cannot both
// pass — which the previous read-then-write windows allowed.
//
// The row is created 'pending' before the provider is called, so an in-flight
// call already counts. Settle it afterwards with settleMeteredAction.
export async function consumeQuota(
  supabase: SupabaseClient,
  actionType: MeteredActionType,
  window: QuotaWindow,
  context: MeteredContext = {}
): Promise<QuotaOutcome> {
  const { data, error } = await supabase.rpc("consume_action_quota", {
    p_action_type: actionType,
    p_per_minute: window.perMinute,
    p_per_day: window.perDay,
    p_user_id: context.userId ?? null,
    p_workflow_id: context.workflowId ?? null,
    p_run_id: context.runId ?? null,
    p_node_id: context.nodeId ?? null,
    p_input_units: null,
    p_output_units: null
  });

  if (error) {
    throw new Error(`Couldn't verify usage limits: ${error.message}`);
  }

  const result = data as RpcResult;

  if (!result.allowed) {
    return { allowed: false, reason: result.reason ?? "per_minute", limit: result.limit };
  }

  return { allowed: true, executionId: result.execution_id as string };
}

export interface MeteredUsage {
  inputUnits?: number;
  outputUnits?: number;
}

// Settles a metered row once the provider call returns. Permitted by the
// status-constrained UPDATE policy because the row is still 'pending'.
// Never throws: losing a usage measurement must not fail a call that already
// succeeded and already consumed its quota.
export async function settleMeteredAction(
  supabase: SupabaseClient,
  executionId: string,
  status: "succeeded" | "failed",
  usage: MeteredUsage = {}
): Promise<void> {
  await supabase
    .from("integration_action_executions")
    .update({
      status,
      input_units: usage.inputUnits ?? null,
      output_units: usage.outputUnits ?? null
    })
    .eq("id", executionId);
}

export function quotaMessage(outcome: Extract<QuotaOutcome, { allowed: false }>, noun: string): string {
  if (outcome.reason === "per_day") {
    return `You've hit today's ${noun} limit — try again tomorrow.`;
  }
  if (outcome.reason === "unauthenticated") {
    return "Unauthorized";
  }
  return `You've hit the ${noun} limit — try again in a minute.`;
}

export class QuotaExceededError extends Error {}

// Meters one provider call end to end: consume before spending, settle after.
// Used by the server executor for AI and Lookup nodes, which reach the
// providers directly rather than through the API routes.
export async function withMeteredCall<T>(
  supabase: SupabaseClient,
  actionType: MeteredActionType,
  window: QuotaWindow,
  context: MeteredContext,
  noun: string,
  run: (recordUsage: (usage: MeteredUsage) => void) => Promise<T>
): Promise<T> {
  const outcome = await consumeQuota(supabase, actionType, window, context);

  if (!outcome.allowed) {
    throw new QuotaExceededError(quotaMessage(outcome, noun));
  }

  let usage: MeteredUsage = {};

  try {
    const result = await run((measured) => {
      usage = measured;
    });
    await settleMeteredAction(supabase, outcome.executionId, "succeeded", usage);
    return result;
  } catch (error) {
    await settleMeteredAction(supabase, outcome.executionId, "failed", usage);
    throw error;
  }
}
