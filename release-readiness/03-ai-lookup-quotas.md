# Objective

Stop a single user — or a single script — from draining the operator's Anthropic and Tavily balance. Today both AI and Lookup calls are authenticated but completely unmetered, and every user spends the operator's money from a shared API key.

This task has **two halves with different owners and very different timelines**: provider-side budget caps (manual, sub-hour, do first) and durable per-user quotas (code, 1–2 days). Do not let the code half delay the console half.

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

- [ ] Extend the ledger with `ai.call` and `lookup.search` action types so AI and Lookup consume the same durable mechanism that already governs Gmail and HTTP. One mechanism yields quotas, an audit trail, and the future billing foundation — resist building a parallel system.
- [ ] Enforce a per-user AI quota and a per-user Lookup quota on `app/api/execute/route.ts` and `app/api/lookup/route.ts`. Return `429` with a clear message when exceeded.
- [ ] Add a per-run AI-node cap in `lib/execution/validate.ts`, so a single pathological graph cannot spend unboundedly inside one run.
- [ ] Wire `consumeRunAction` (or its equivalent) for AI and Lookup so `MAX_EXTERNAL_ACTIONS_PER_RUN` actually means what its name says.
- [ ] Do not silently preserve `MAX_CONCURRENT_REQUESTS` as though it works. Either replace it with a durable mechanism or **mark it explicitly as a known no-op on serverless** so nobody mistakes it for a control. Leaving a dead limit in a limits file is worse than not having it.
- [ ] Record enough per-call data (user, action type, timestamp, and a usage measure) that the table can later back billing. Token counts if cheaply available; call counts at minimum.
- [ ] **B11** — make the quota check atomic. A conditional insert or a single statement that both checks and consumes, rather than read-then-write. Same treatment for the existing Gmail/HTTP windows, since they share the code path.
- [ ] **B11** — resolve the `gmail.draft` omission at `limits.ts:65`, or record why it is moot under the A15 decision.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Integration test: fire N+1 AI calls as one user; the N+1th returns `429`, and the ledger row count matches N. The row count check matters — a `429` that still consumed a call is a different bug.
- [ ] Same test for Lookup.
- [ ] Test that a graph exceeding the per-run AI-node cap fails validation cleanly rather than partway through execution.
- [ ] **B11** — a concurrency test firing simultaneous requests at a quota boundary and asserting the limit is not overshot. If this cannot be made deterministic, say so rather than shipping a test that passes by luck.

**Manual**

- [ ] Confirm the provider console caps are actually in force by checking the console UI, not by inference.
- [ ] Run a normal workflow and confirm quotas do not fire on legitimate use — a quota that breaks ordinary usage will be disabled in a panic, which is worse than no quota.

# Stop Conditions

Stop and ask before proceeding if:

- The task would require **changing Anthropic or Tavily billing or budget settings**. Hard stop — the agent documents; the operator performs.
- Choosing quota *values* requires knowing acceptable per-user cost. The audit does not specify numbers, and guessing wrong in either direction is bad. Propose values and ask.
- Extending the ledger requires a migration that would need to be applied remotely. Create it locally; do not push it.
- Making the check atomic appears to require restructuring `lib/integrations/idempotency.ts` or `claimAction.ts`. Those are load-bearing, unit-tested, and explicitly listed in the audit as "do not rebuild." Stop and ask.
- The work drifts toward implementing D3 (payments). Build a billable *shape*; do not build billing.

# Completion Criteria

- Both `/api/execute` and `/api/lookup` enforce durable, per-user quotas backed by the database — not by process memory.
- Ledger extended with the new action types; usage data recorded in a shape that could back billing later.
- Per-run AI-node cap enforced in validation.
- `MAX_CONCURRENT_REQUESTS` either fixed or explicitly labeled a no-op.
- Quota checks atomic, or the residual race documented with its bound.
- Provider console caps confirmed by the operator and recorded in `RELEASE_PROGRESS.md` under Manual Actions — **not** marked as agent-completed work.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

**Do these first. They are the only cost control that does not depend on code being correct.**

1. **Anthropic Console** — set a hard spend limit on the account or key used by WfloAI. Note the configured number here once set.
2. **Tavily Console** — set the equivalent usage or spend cap.
3. **Set up billing alerts** on both at a threshold below the hard cap, so you learn about a runaway before it stops rather than after.
4. **Record the chosen per-user quota values** once decided, so the code half has a specification rather than a guess.
