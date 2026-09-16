import { HTTP_LIMITS } from "@/lib/http/constants";

// A11 — runtime bounds for a single workflow execution.
//
// Values marked PROPOSED are product judgment the audit does not supply; Task
// 04's Stop Conditions make them an operator decision ("propose numbers with
// reasoning and ask"). They are defaults, not settled policy — Manual Step 2.
export const EXECUTION_LIMITS = {
  // PROPOSED. Far above any sensible graph; the 20-AI-node cap from Task 03
  // bounds spend well before this bounds size. This exists so an absurd graph
  // fails at validation instead of partway through a run.
  MAX_NODES_PER_RUN: 60,

  // Provider abort timeouts. Deliberately the same shape as the HTTP node's
  // limits rather than a second convention: Lookup is an ordinary request and
  // reuses that ceiling directly. The AI call gets a longer one because it
  // streams up to max_tokens.
  LOOKUP_TIMEOUT_MS: HTTP_LIMITS.TOTAL_TIMEOUT_MS,
  // PROPOSED. Haiku at max_tokens 4096 normally finishes well inside this.
  AI_TIMEOUT_MS: 60_000
} as const;

// Matches app/api/inngest/route.ts, which already declares 300. Cannot exceed
// the deployment host's plan ceiling — Task 04 Manual Step 1, and a hosting
// decision rather than a code one.
export const EXECUTE_ROUTE_MAX_DURATION_SECONDS = 300;
