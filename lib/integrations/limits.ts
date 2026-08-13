import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationContext } from "@/lib/integrations/types";

// Single source for integration abuse limits (like lib/files/constants.ts for
// file sizes). Window counts read the integration_action_executions ledger;
// the concurrency gauge is in-memory (per server instance — the ledger and
// per-run cap are the durable backstops).
export const INTEGRATION_LIMITS = {
  MAX_CONCURRENT_REQUESTS: 5,
  HTTP_MUTATIONS_PER_MINUTE: 60,
  GMAIL_SENDS_PER_MINUTE: 10,
  GMAIL_SENDS_PER_DAY: 200,
  MAX_EXTERNAL_ACTIONS_PER_RUN: 50
} as const;

const activeRequestsByUser = new Map<string, number>();

export function acquireConcurrencySlot(userId: string): () => void {
  const active = activeRequestsByUser.get(userId) ?? 0;
  if (active >= INTEGRATION_LIMITS.MAX_CONCURRENT_REQUESTS) {
    throw new Error("Too many integration requests are running at once — try again in a moment.");
  }
  activeRequestsByUser.set(userId, active + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = activeRequestsByUser.get(userId) ?? 1;
    if (current <= 1) {
      activeRequestsByUser.delete(userId);
    } else {
      activeRequestsByUser.set(userId, current - 1);
    }
  };
}

export function consumeRunAction(ctx: IntegrationContext): void {
  ctx.actionsUsed.count += 1;
  if (ctx.actionsUsed.count > INTEGRATION_LIMITS.MAX_EXTERNAL_ACTIONS_PER_RUN) {
    throw new Error(
      `This run exceeded the limit of ${INTEGRATION_LIMITS.MAX_EXTERNAL_ACTIONS_PER_RUN} external actions.`
    );
  }
}

async function countLedgerActions(
  supabase: SupabaseClient,
  userId: string,
  actionTypes: string[],
  sinceIso: string
): Promise<number> {
  const { count, error } = await supabase
    .from("integration_action_executions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("action_type", actionTypes)
    .gte("created_at", sinceIso);

  if (error) {
    throw new Error(`Couldn't verify usage limits: ${error.message}`);
  }
  return count ?? 0;
}

const GMAIL_SEND_ACTIONS = ["gmail.send", "gmail.reply"];

export async function checkGmailSendQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const now = Date.now();
  const perMinute = await countLedgerActions(
    supabase,
    userId,
    GMAIL_SEND_ACTIONS,
    new Date(now - 60_000).toISOString()
  );
  if (perMinute >= INTEGRATION_LIMITS.GMAIL_SENDS_PER_MINUTE) {
    throw new Error("You've hit the Gmail sending limit — try again in a minute.");
  }

  const perDay = await countLedgerActions(
    supabase,
    userId,
    GMAIL_SEND_ACTIONS,
    new Date(now - 86_400_000).toISOString()
  );
  if (perDay >= INTEGRATION_LIMITS.GMAIL_SENDS_PER_DAY) {
    throw new Error("You've hit today's Gmail sending limit — try again tomorrow.");
  }
}

const HTTP_MUTATION_ACTIONS = ["http.POST", "http.PUT", "http.PATCH", "http.DELETE"];

export async function checkHttpMutationQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const perMinute = await countLedgerActions(
    supabase,
    userId,
    HTTP_MUTATION_ACTIONS,
    new Date(Date.now() - 60_000).toISOString()
  );
  if (perMinute >= INTEGRATION_LIMITS.HTTP_MUTATIONS_PER_MINUTE) {
    throw new Error("You've hit the HTTP request limit — try again in a minute.");
  }
}
