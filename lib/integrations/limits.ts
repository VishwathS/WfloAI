import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationContext } from "@/lib/integrations/types";

// Single source for integration abuse limits (like lib/files/constants.ts for
// file sizes). Every window here is derived from the
// integration_action_executions ledger, so all of them survive serverless
// instance churn. Nothing in this file is in-memory any more — see the note on
// MAX_CONCURRENT_REQUESTS below.
//
// A2 — AI and Lookup quota values.
//
// PROPOSED, pending operator confirmation. Task 03's Stop Conditions make the
// final numbers an operator decision ("propose values and ask"), and Manual
// Step 4 is where the confirmed values get recorded. These defaults are derived
// from the unit-cost estimate in lib/integrations/pricing.ts: they bound a
// single user's worst-case monthly spend to a number the operator chose rather
// than to infinity, while sitting well above ordinary use.
//
// AI_CALLS_PER_DAY is the number that actually bounds spend; the per-minute
// windows bound burst and keep us inside provider rate limits.
export const INTEGRATION_LIMITS = {
  HTTP_MUTATIONS_PER_MINUTE: 60,
  GMAIL_SENDS_PER_MINUTE: 10,
  GMAIL_SENDS_PER_DAY: 200,
  AI_CALLS_PER_MINUTE: 20,
  AI_CALLS_PER_DAY: 200,
  LOOKUP_SEARCHES_PER_MINUTE: 10,
  LOOKUP_SEARCHES_PER_DAY: 100,
  MAX_EXTERNAL_ACTIONS_PER_RUN: 50,
  MAX_AI_NODES_PER_RUN: 20
} as const;

export const AI_QUOTA = {
  perMinute: INTEGRATION_LIMITS.AI_CALLS_PER_MINUTE,
  perDay: INTEGRATION_LIMITS.AI_CALLS_PER_DAY
} as const;

export const LOOKUP_QUOTA = {
  perMinute: INTEGRATION_LIMITS.LOOKUP_SEARCHES_PER_MINUTE,
  perDay: INTEGRATION_LIMITS.LOOKUP_SEARCHES_PER_DAY
} as const;

// MAX_CONCURRENT_REQUESTS and acquireConcurrencySlot were removed here —
// Task 03 Half 2, resolution **B**.
//
// The requirement was: bound a single user's simultaneous spend, and stay
// inside provider rate limits. The old control was an in-memory Map, which is
// a no-op on serverless (every request may land in a fresh instance) and worse
// than nothing because it reads as a working control. Building a durable
// replacement would mean a second claim mechanism alongside the ledger, which
// this task explicitly warns against.
//
// The durable protections that satisfy the requirement in its place:
//   - ledger-derived per-minute windows on AI, Lookup, Gmail and HTTP, now
//     consumed atomically (consume_action_quota)
//   - MAX_EXTERNAL_ACTIONS_PER_RUN, enforced by consumeRunAction
//   - MAX_AI_NODES_PER_RUN, enforced in lib/execution/validate.ts
//   - maxDuration on the execute route (Task 04)
//   - the schedule interval floor and per-user schedule cap (Task 05)
//
// A per-minute window bounds burst spend regardless of how many instances serve
// the requests, which an in-process gauge never did.

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

// B11 noted 'gmail.draft' is absent here. Moot under the A15 decision: V1 is
// Gmail Send only, Create Draft is gated off at both the dropdown and execution
// (lib/gmail/scopes.ts, isRestrictedAction), so no draft can be created to go
// unquotaed. If the deferred D1 program ever enables Create Draft, add
// 'gmail.draft' here at the same time — drafts consume provider quota even
// though they send no mail.
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

export interface GmailSendUsage {
  sentThisMinute: number;
  sentToday: number;
  perMinuteLimit: number;
  perDayLimit: number;
}

// A14a: a limit the user cannot see is a limit they will hit by surprise. Same
// action list and same counter as checkGmailSendQuota, so the number in
// Settings cannot drift from the number that is enforced.
export async function gmailSendUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<GmailSendUsage> {
  const now = Date.now();

  const [sentThisMinute, sentToday] = await Promise.all([
    countLedgerActions(supabase, userId, GMAIL_SEND_ACTIONS, new Date(now - 60_000).toISOString()),
    countLedgerActions(supabase, userId, GMAIL_SEND_ACTIONS, new Date(now - 86_400_000).toISOString())
  ]);

  return {
    sentThisMinute,
    sentToday,
    perMinuteLimit: INTEGRATION_LIMITS.GMAIL_SENDS_PER_MINUTE,
    perDayLimit: INTEGRATION_LIMITS.GMAIL_SENDS_PER_DAY
  };
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
