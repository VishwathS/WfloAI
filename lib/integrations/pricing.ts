// Task 03 Half 3 — per-user unit cost.
//
// This is NOT billing (D3 stays deferred) and NOT the spend cap. A cap bounds
// the worst case; this answers what an ordinary active user actually costs.
// The deliverable is a re-runnable calculation plus its inputs, so the number
// can be re-derived later instead of being trusted on sight.
//
// !! OPERATOR: VERIFY THESE PRICES BEFORE RELYING ON THE FIGURE. !!
// They were recorded from the providers' published pricing pages on the date
// below and are not fetched at runtime. Provider prices change; a number
// without its inputs cannot be re-derived six months later, which is why the
// date and the source live next to the values.
export const PRICES_READ_ON = "2026-09-15";

export const PRICE_SOURCES = {
  anthropic: "https://www.anthropic.com/pricing",
  tavily: "https://tavily.com/#pricing"
} as const;

// USD. The executors use claude-haiku-4-5 at max_tokens 4096
// (lib/execution/serverExecutor.ts, app/api/execute/route.ts).
export const PROVIDER_PRICES = {
  aiInputPerMTok: 1.0,
  aiOutputPerMTok: 5.0,
  lookupPerSearch: 0.008
} as const;

// Representative per-call token counts. These are the estimate's weakest input
// and must be replaced by measured values from the ledger's input_units /
// output_units columns as soon as real runs exist — see
// docs/unit-cost-method.sql.
export const AVG_TOKENS = {
  inputPerCall: 1500,
  outputPerCall: 800,
  maxOutputTokens: 4096
} as const;

export interface UsageTotals {
  aiInputTokens: number;
  aiOutputTokens: number;
  lookupSearches: number;
}

export function costUsd(usage: UsageTotals): number {
  return (
    (usage.aiInputTokens / 1_000_000) * PROVIDER_PRICES.aiInputPerMTok +
    (usage.aiOutputTokens / 1_000_000) * PROVIDER_PRICES.aiOutputPerMTok +
    usage.lookupSearches * PROVIDER_PRICES.lookupPerSearch
  );
}

// The ceiling a single user can reach in a day once the AI and Lookup day
// quotas are in force. This is a *bound*, not an expectation — it is what the
// quota values buy you, and it is the honest worst case to quote alongside the
// estimate.
export function worstCaseDailyCostUsd(limits: {
  AI_CALLS_PER_DAY: number;
  LOOKUP_SEARCHES_PER_DAY: number;
}): number {
  return costUsd({
    // Worst case assumes every AI call runs to the max_tokens ceiling.
    aiInputTokens: limits.AI_CALLS_PER_DAY * AVG_TOKENS.maxOutputTokens,
    aiOutputTokens: limits.AI_CALLS_PER_DAY * AVG_TOKENS.maxOutputTokens,
    lookupSearches: limits.LOOKUP_SEARCHES_PER_DAY
  });
}

// Cost per run and per active user per month, from call counts alone. Used for
// the pre-launch estimate, before measured token counts exist.
export function estimateFromCallCounts(input: {
  aiCalls: number;
  lookupSearches: number;
}): number {
  return costUsd({
    aiInputTokens: input.aiCalls * AVG_TOKENS.inputPerCall,
    aiOutputTokens: input.aiCalls * AVG_TOKENS.outputPerCall,
    lookupSearches: input.lookupSearches
  });
}
