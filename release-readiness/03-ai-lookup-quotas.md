# Objective

Stop a single user — or a single script — from draining the operator's Anthropic and Tavily balance. Today both AI and Lookup calls are authenticated but completely unmetered, and every user spends the operator's money from a shared API key.

This task has **three parts with different owners and very different timelines**: provider-side budget caps (manual, sub-hour, do first), durable per-user quotas (code, 1–2 days), and a small unit-cost measurement built on the same metering data (a query and a recorded number). Do not let the code half delay the console half.

Keep the first and third distinct throughout: **a cap bounds the worst case; the unit cost is what an ordinary user costs.** Conflating them is how a plan ends up with spend controls but no basis for deciding who to admit.

# Audit Items

**A2** (no rate limiting on `/api/execute` and `/api/lookup`) · **B11** (non-atomic quota checks)

Forward reference: **D3 (payments)** is deferred, but the metering table built here is its foundation. Build it in a shape you can bill from.

# Current State

There is no rate limiting anywhere in the application outside `lib/integrations/limits.ts`.

`app/api/execute/route.ts` (Anthropic) and `app/api/lookup/route.ts` (Tavily) both require authentication and then impose **no limit of any kind** — no per-user cap, no token budget, no usage table, no counter.

`ANTHROPIC_API_KEY` and `TAVILY_API_KEY` are single shared operator keys. The model is `claude-haiku-4-5-20251001` at `max_tokens: 4096` (`lib/execution/serverExecutor.ts:189` and `app/api/execute/route.ts:51`).

### What `lib/integrations/limits.ts` does and does not cover

```ts
export const INTEGRATION_LIMITS = {
  MAX_CONCURRENT_REQUESTS: 5,
  HTTP_MUTATIONS_PER_MINUTE: 60,
  GMAIL_SENDS_PER_MINUTE: 10,
  GMAIL_SENDS_PER_DAY: 200,
  MAX_EXTERNAL_ACTIONS_PER_RUN: 50
} as const;
```

Three things matter here:

1. **`MAX_EXTERNAL_ACTIONS_PER_RUN: 50` does not bound AI spend.** `consumeRunAction` is never called for AI or Lookup nodes. The cap covers Gmail and HTTP only.
2. **`MAX_CONCURRENT_REQUESTS: 5` is an in-memory `Map`** (`limits.ts:16`) — a **no-op on serverless**, as the file's own comment concedes. It must not be treated as an existing control.
3. **The DB-backed windows are check-then-act** (B11). Two concurrent requests can both read `perMinute = 9` and both proceed. Bounded in impact — the idempotency ledger still prevents *duplicates* — but the quota is soft under concurrency. Also, `gmail.draft` is absent from `GMAIL_SEND_ACTIONS` (`limits.ts:65`), so drafts are unquotaed except by the per-run cap. If task 01's A15 change removes Create Draft from V1, this specific gap is moot for now — confirm before spending effort on it.

The good news: the Gmail/HTTP quotas are **DB-backed via `integration_action_executions` and therefore durable**. That is the right pattern, and it is the one to extend.

# Required Changes

### Half 1 — provider budget caps (manual, do first)

- [ ] Recorded as complete only when the operator confirms. See `# Manual / External Steps`.

### Half 2 — durable per-user quotas (code)

- [x] Extend the ledger with `ai.call` and `lookup.search` action types so AI and Lookup consume the same durable mechanism that already governs Gmail and HTTP. One mechanism yields quotas, an audit trail, and the future billing foundation — resist building a parallel system.
- [x] Enforce a per-user AI quota and a per-user Lookup quota on `app/api/execute/route.ts` and `app/api/lookup/route.ts`. Return `429` with a clear message when exceeded.
- [x] Add a per-run AI-node cap in `lib/execution/validate.ts`, so a single pathological graph cannot spend unboundedly inside one run.
- [x] Wire `consumeRunAction` (or its equivalent) for AI and Lookup so `MAX_EXTERNAL_ACTIONS_PER_RUN` actually means what its name says.
- [x] **Resolve `MAX_CONCURRENT_REQUESTS` — pick A or B and record which.** Leaving it standing unchanged is not an option: a safety control the deployment model cannot enforce is worse than no control, because it is read as one.

  State the underlying requirement first, because that is what has to be satisfied — **bound a single user's simultaneous spend, and stay inside provider rate limits.** Then take whichever of these is the smallest robust answer given the actual deployment architecture:

  - **A — implement a durable mechanism.** If that requirement genuinely needs its own control for V1, build one appropriate to serverless — a DB-backed claim in the existing `integration_action_executions` ledger is the pattern already in the codebase. Do not invent a second mechanism.
  - **B — remove or reframe the ineffective control**, and name the durable protections that actually satisfy the requirement in its place: the ledger-derived per-minute/per-day windows, `MAX_EXTERNAL_ACTIONS_PER_RUN`, the per-run AI-node cap added above, `maxDuration` on the execute route (Task 04), and the schedule floor and per-user schedule cap (Task 05). If those cover it, say so explicitly and delete the misleading constant rather than leaving it commented.

  Record the choice and the reasoning in this task file and in `RELEASE_PROGRESS.md`. Task 15 certifies whichever option was taken, and needs to know which.
- [x] Record enough per-call data (user, action type, timestamp, and a usage measure) that the table can later back billing. Token counts if cheaply available; call counts at minimum.
- [x] **B11** — make the quota check atomic. A conditional insert or a single statement that both checks and consumes, rather than read-then-write. Same treatment for the existing Gmail/HTTP windows, since they share the code path.
- [x] **B11** — resolve the `gmail.draft` omission at `limits.ts:65`, or record why it is moot under the A15 decision.

### Half 3 — unit-cost measurement (small, and not the same thing as a cap)

**Spend caps bound the worst case. Unit cost answers what an active user actually costs per month.** These are different numbers with different uses, and a cap is not a substitute for the measurement. The Phase 3 decision about broader signup (MASTER §4) and Task 17's Gate 11 both need the second number, and nothing in the plan currently produces it.

**This is not a billing analytics system.** D3 (payments) stays deferred. The deliverable is a query and a recorded number — no dashboard, no cost table, no per-request price attribution, no new service.

- [x] **Define the measurement method** against the metering table Half 2 already builds. Per user, per period: count ledger rows by action type (`ai.call`, `lookup.search`, plus the existing Gmail/HTTP types), take token counts where Half 2 recorded them cheaply, and otherwise multiply call counts by an average tokens-per-call sampled from a handful of representative runs. Apply the current published provider unit prices. Produce two figures: **cost per run** and **cost per active user per month**.
- [x] **Write the method down where it can be re-run** — the query plus the price constants used and the date they were read. Provider prices change; a number without its inputs cannot be re-derived or trusted six months later.
- [x] **Record a pre-launch estimate from evidence available at Task 03 time.** This task does **not** wait for Phase 1 private-beta traffic or Task 15 certification runs: it executes before either can exist, so a criterion depending on them is unsatisfiable here and must not be written as one. Derive the estimate from the legitimate evidence that does exist now — the per-user quota ceilings this task sets, the model and `max_tokens` the executors actually use, metering rows from safe local/test execution of representative workflows, and published provider prices. Label it an **estimate**, state its basis *and its limitations* explicitly, and never present it as measured. An estimate is honest evidence for a capped or invite-only launch; it is not the final number.
- [x] **State explicitly that the figure is finalized only against real production usage.** **Task 17 Gate 11 owns the measured figure**, captured through its Manual Step 11. Task 15 may produce useful measurement evidence, but it does not own this criterion and **Task 03 must not wait for Task 15**. Broader signup is the decision that needs the measured number — that gate lives in Task 17, not here.

# Implementation record (2026-09-15)

## `MAX_CONCURRENT_REQUESTS` — resolved as **B** (control removed and reframed)

The requirement was: *bound a single user's simultaneous spend, and stay inside provider rate limits.*

The old control was an in-memory `Map` in `lib/integrations/limits.ts`. It is a no-op on serverless — each request may be served by a fresh instance — and worse than nothing, because it reads as a working control. Option A would have meant a second durable claim mechanism beside the ledger, which this task explicitly warns against building.

**Removed**, and the durable protections that satisfy the requirement in its place are now named in the code where the constant used to be:

| Protection | Where |
|---|---|
| Ledger-derived per-minute windows on AI, Lookup, Gmail, HTTP — now consumed **atomically** | `consume_action_quota` (migration `202609150002`) |
| `MAX_EXTERNAL_ACTIONS_PER_RUN`, now also counting AI and Lookup | `consumeRunAction` |
| `MAX_AI_NODES_PER_RUN` | `lib/execution/validate.ts` |
| `maxDuration` on the execute route | Task 04 |
| Schedule interval floor and per-user schedule cap | Task 05 |

A per-minute window bounds burst spend regardless of how many instances serve the requests, which an in-process gauge never did. **Task 15 should certify option B.**

## Metering covers the primary path, not just the two routes

The task names `/api/execute` and `/api/lookup`. Those are the *legacy browser* path. `lib/execution/serverExecutor.ts` calls Anthropic and Tavily **directly** and is the primary run path for both manual and scheduled runs — metering only the routes would have left the main spend path unmetered. Every call site is now metered:

| Call site | Action type |
|---|---|
| `app/api/execute/route.ts` | `ai.call` |
| `app/api/lookup/route.ts` | `lookup.search` |
| `serverExecutor` AI node | `ai.call` |
| `serverExecutor` **Router node** | `ai.call` |
| `serverExecutor` Lookup node | `lookup.search` |

Router nodes were easy to miss: a Router is an AI call and spends exactly like an AI node. It is metered, and it counts against `MAX_AI_NODES_PER_RUN`.

AI and Lookup nodes now **refuse to run without an `IntegrationContext`**, the same way Gmail and HTTP nodes do, so there is no code path that executes a spending node unmetered.

## B11 — atomicity, and the residual race that remains

`consume_action_quota` counts and inserts inside one statement, serialized by a transaction-scoped advisory lock on `(user, action_type)`. Counting and inserting in one statement is *not* sufficient on its own under `READ COMMITTED` — two transactions cannot see each other's uncommitted insert — which is why the lock is there. The row is inserted `pending` before the provider is called, so an in-flight call already counts against the window, and is settled to `succeeded`/`failed` afterwards.

**Residual race, and its bound: Gmail and HTTP are NOT atomic.** Making them atomic requires merging their quota check into `claimAction`, and restructuring `lib/integrations/idempotency.ts` is an explicit Stop Condition in this task (load-bearing, unit-tested, do not rebuild). So the pre-existing check-then-act window is preserved there and documented instead:

- **Bound:** at most (concurrent requests at the boundary minus one) actions beyond the limit, per user, per window. It cannot compound — the next window's count includes the overshoot.
- **What it is not:** it is not a duplicate-send risk. The idempotency ledger still guarantees exactly-once per `runId:nodeId`.
- **Fix when it is cheap:** whoever next has reason to touch `claimAction` should have it call `consume_action_quota`, at which point Gmail and HTTP inherit atomicity for free.

## B11 — `gmail.draft` omission: moot under A15

`GMAIL_SEND_ACTIONS` still omits `gmail.draft`. Under Task 01's A15 decision V1 is **Gmail Send only**: Create Draft is gated off at both the dropdown and execution, so no draft can be created to go unquotaed. A code comment at the omission records that `gmail.draft` must be added at the same time the deferred D1 program enables Create Draft.

## Half 3 — unit-cost method

**Inputs, so the number can be re-derived rather than trusted.** Price constants live in `lib/integrations/pricing.ts` with the date they were read and their source. **The operator must verify them** — they are recorded from published pricing pages, not fetched at runtime.

Re-runnable query (per user, per period) against the metering columns added by `202609150002`:

```sql
-- Per-user usage for a period. Feed the totals to costUsd() in
-- lib/integrations/pricing.ts, or price them inline as below.
select
  user_id,
  count(*) filter (where action_type = 'ai.call') as ai_calls,
  coalesce(sum(input_units)  filter (where action_type = 'ai.call'), 0) as ai_input_tokens,
  coalesce(sum(output_units) filter (where action_type = 'ai.call'), 0) as ai_output_tokens,
  count(*) filter (where action_type = 'lookup.search') as lookup_searches,
  round(
      coalesce(sum(input_units)  filter (where action_type = 'ai.call'), 0) / 1e6 * 1.00
    + coalesce(sum(output_units) filter (where action_type = 'ai.call'), 0) / 1e6 * 5.00
    + count(*) filter (where action_type = 'lookup.search') * 0.008
  , 4) as cost_usd
from public.integration_action_executions
where created_at >= now() - interval '30 days'
group by user_id
order by cost_usd desc;
```

Divide by distinct active users for **cost per active user per month**; group by `run_id` instead of `user_id` for **cost per run**.

### Pre-launch ESTIMATE — recorded 2026-09-15

**This is an ESTIMATE, not a measurement.** Per the lifecycle correction above, it is derived from evidence available at Task 03 time and does not wait on Phase 1 or Task 15 traffic.

**Basis:**

1. The model and ceiling the executors actually use — `claude-haiku-4-5-20251001`, `max_tokens: 4096`.
2. Published provider prices as recorded in `pricing.ts` on 2026-09-15 (**operator to verify**).
3. Representative per-call token counts — `AVG_TOKENS` = 1500 in / 800 out.
4. The quota ceilings this task sets, which produce the worst case.

| Figure | Value | How |
|---|---|---|
| Cost per AI call | **$0.0055** | 1500 in at $1/MTok + 800 out at $5/MTok |
| Cost per run (3 AI + 1 lookup) | **$0.0245** | |
| Light user / month (20 runs) | **$0.49** | 60 AI calls + 20 searches |
| Heavy user / month (120 runs) | **$4.26** | 600 AI calls + 120 searches |
| **Worst case / user / day at the caps** | **$5.72** | 200 AI calls at the 4096-token ceiling + 100 searches |
| **Worst case / user / month at the caps** | **$171.46** | |

**Limitations — read these before using the number:**

- `AVG_TOKENS` is an assumption, not a measurement. It is the weakest input and should be replaced with real `input_units`/`output_units` sums as soon as any real runs exist.
- No production usage exists yet, so the light and heavy profiles are assumed usage shapes, not observed ones.
- Provider prices are transcribed, not fetched. If they have moved, every figure moves with them.
- The worst case assumes every call runs to the `max_tokens` ceiling on both input and output. It is deliberately pessimistic — it is what the caps *permit*, not what anyone expects.

**This estimate is an acceptable basis for a capped or invite-only launch. It is not a basis for opening signup** — Task 17 Gate 11 owns the measured figure.

### Proposed quota values — OPERATOR CONFIRMATION OUTSTANDING

This task's Stop Conditions make the final numbers the operator's call (propose values and ask). Implemented as defaults in `INTEGRATION_LIMITS` and clearly labelled as proposed:

| Limit | Proposed | Rationale |
|---|---|---|
| `AI_CALLS_PER_MINUTE` | 20 | Above any single run's burst; bounds a script |
| `AI_CALLS_PER_DAY` | 200 | About 10x a heavy user's daily use; sets the $5.72/day worst case |
| `LOOKUP_SEARCHES_PER_MINUTE` | 10 | |
| `LOOKUP_SEARCHES_PER_DAY` | 100 | About 25x a heavy user's daily use |
| `MAX_AI_NODES_PER_RUN` | 20 | Well above any sensible graph |

Changing them is a one-line edit in `lib/integrations/limits.ts`. Record the confirmed values under Manual Step 4.

## Verification not runnable here

The task's Verification section asks for integration tests that fire N+1 calls and assert a `429` plus a ledger row count, and a concurrency test at the quota boundary. **Those need a live Postgres**; this repo's suite is pure-function Vitest with no database fixture, and standing one up is a test-infrastructure project that MASTER section 7.7 puts out of bounds. What `tests/quota.test.ts` covers instead: the per-run AI-node cap at and over the boundary (including Router nodes and unreachable-node filtering), quota message selection, and the cost calculation. **The DB-level quota tests are recorded as outstanding** — they are the natural home for Task 12's CI work or a Task 15 production check.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [ ] Integration test: fire N+1 AI calls as one user; the N+1th returns `429`, and the ledger row count matches N. The row count check matters — a `429` that still consumed a call is a different bug.
- [ ] Same test for Lookup.
- [x] Test that a graph exceeding the per-run AI-node cap fails validation cleanly rather than partway through execution.
- [ ] **B11** — a concurrency test firing simultaneous requests at a quota boundary and asserting the limit is not overshot. If this cannot be made deterministic, say so rather than shipping a test that passes by luck.

**Manual**

- [ ] Confirm the provider console caps are actually in force by checking the console UI, not by inference.
- [ ] Run a normal workflow and confirm quotas do not fire on legitimate use — a quota that breaks ordinary usage will be disabled in a panic, which is worse than no quota.

# Stop Conditions

Stop and ask before proceeding if:

- The task would require **changing Anthropic or Tavily billing or budget settings**. Hard stop — the agent documents; the operator performs.
- Choosing quota *values* requires knowing acceptable per-user cost. The audit does not specify numbers, and guessing wrong in either direction is bad. Propose values and ask — Half 3's estimate is the input, not a substitute for the operator's decision.
- Half 3 starts growing into cost dashboards, per-request price attribution, or anything resembling billing. Stop. The deliverable is a re-runnable query and a recorded number; D3 stays deferred.
- Extending the ledger requires a migration that would need to be applied remotely. Create it locally; do not push it.
- Making the check atomic appears to require restructuring `lib/integrations/idempotency.ts` or `claimAction.ts`. Those are load-bearing, unit-tested, and explicitly listed in the audit as "do not rebuild." Stop and ask.
- The work drifts toward implementing D3 (payments). Build a billable *shape*; do not build billing.

# Completion Criteria

- Both `/api/execute` and `/api/lookup` enforce durable, per-user quotas backed by the database — not by process memory.
- Ledger extended with the new action types; usage data recorded in a shape that could back billing later.
- Per-run AI-node cap enforced in validation.
- `MAX_CONCURRENT_REQUESTS` resolved as **either A (durable mechanism implemented) or B (control removed/reframed with the durable protections named)**, with the choice and its reasoning recorded here and in `RELEASE_PROGRESS.md`. Not left standing as an unenforceable claim.
- Unit-cost method documented and re-runnable (query, price constants, date read), with a **pre-launch estimate recorded and labeled as an estimate**, naming the evidence it was derived from and its limitations. **This criterion is satisfiable at Task 03 time and must not be made to depend on Phase 1 private-beta traffic or Task 15 certification traffic** — Task 17 Gate 11 owns the later measured figure. Distinct from the provider spend caps, and explicitly not a billing system.
- Quota checks atomic, or the residual race documented with its bound.
- Provider console caps confirmed by the operator and recorded in `RELEASE_PROGRESS.md` under Manual Actions — **not** marked as agent-completed work.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

**Do these first. They are the only cost control that does not depend on code being correct.**

1. **Anthropic Console** — set a hard spend limit on the account or key used by WfloAI. Note the configured number here once set.
2. **Tavily Console** — set the equivalent usage or spend cap.
3. **Set up billing alerts** on both at a threshold below the hard cap, so you learn about a runaway before it stops rather than after.
4. **Record the chosen per-user quota values** once decided, so the code half has a specification rather than a guess.
5. **Record the per-user unit-cost estimate** produced by Half 3 — the number, its basis (what evidence it was derived from, over what period), the provider prices used, and the date they were read. This is the input to Task 17's Gate 11.
6. **Re-measure after real usage.** The estimate is superseded by a measured figure once real users have generated real traffic; Task 17's Manual Step 11 owns that re-measurement, and widening signup depends on it. If sufficient measured usage still does not exist when the launch decision is taken, Task 17 surfaces that gap explicitly for a human decision made on the estimate — it does not manufacture precision that the data does not support.
