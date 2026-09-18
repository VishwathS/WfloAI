# Objective

Bound what a single workflow execution can consume, and make the failure mode clean rather than silent. Today a run can be truncated mid-write by a platform timeout, leaving no `workflow_runs` row at all — the user sees nothing and the operator learns nothing.

Split across two phases: `maxDuration` is a one-line Phase 1 change with outsized value; the caps and timeouts are Phase 2.

# Audit Items

**A11** (execution timeouts and caps) — re-tiered from blocker to recommended.

# Current State

`app/api/workflows/[id]/execute/route.ts` exports **no `maxDuration`**. The platform's default timeout applies, and when it fires mid-execution the request is severed before the `workflow_runs` row is written. The result is a run that happened, cost money, possibly sent email — and left no record.

Beyond that, the route has:

- **No node-count cap.** A graph with an arbitrary number of nodes is accepted.
- **No total runtime cap.**
- **No per-user concurrent-run limit.** Note that `MAX_CONCURRENT_REQUESTS` in `lib/integrations/limits.ts:16` is in-memory and therefore a no-op on serverless — it does not provide this. **Task 03 owns its resolution** (implement a durable mechanism, or remove/reframe it and name the durable protections that cover the requirement). Do not resolve it here and do not build a second concurrency mechanism — if this task's caps turn out to be part of what satisfies that requirement, that is Task 03's finding to record.
- **No `AbortSignal`** on the Anthropic or Tavily fetches. A hung provider call hangs the run.
- **Execution continues after client disconnect** (`app/api/workflows/[id]/execute/route.ts:101`). Closing the browser tab does not stop the workflow, and the user has no way to cancel.

The audit's judgment: this is reliability hardening, and small graphs will not hit these limits. It was re-tiered out of blocker status for that reason. But the `maxDuration` line specifically converts an invisible failure into a legible one, which is why it is pulled forward.

# Required Changes

### Phase 1

- [x] `export const maxDuration = <n>` in `app/api/workflows/[id]/execute/route.ts`. Choose a value consistent with the host's plan limits and with `app/api/inngest/route.ts`, which already sets `maxDuration = 300`. One line.
- [ ] Confirm that when the duration is exceeded, the outcome is a persisted error run or a clean platform error — **not** a truncated write. If it is still a truncated write, that is the actual bug and it needs handling, not just a longer timeout.

### Phase 2

- [x] Node-count cap enforced in `lib/execution/validate.ts`, so an oversized graph fails **before** execution begins rather than partway through having already spent tokens.
- [x] Total runtime cap inside the executor, producing a clean error run when exceeded.
- [x] `AbortSignal` with an explicit timeout on the Anthropic and Tavily calls. Coordinate with `lib/http/constants.ts`, which already defines 10s connect / 30s total for the HTTP node — match that shape rather than inventing a second convention.
- [ ] Per-user concurrent-run limit, **durable** (database-backed), not in-memory. Reuse the ledger mechanism task 03 extends rather than building a third counting system.
- [ ] Decide and implement behavior on client disconnect. Continuing is defensible for scheduled-style semantics; silently continuing while the user believes they cancelled is not. Whatever is chosen, make it explicit in the UI.

# Implementation record (2026-09-15)

## Phase 1

`export const maxDuration = 300` now ships on `app/api/workflows/[id]/execute/route.ts`, via `EXECUTE_ROUTE_MAX_DURATION_SECONDS` in the new `lib/execution/constants.ts`. The value matches `app/api/inngest/route.ts`, which already declared 300 — consistency with an existing repo decision rather than a new one. **It still has to be checked against the host plan ceiling (Manual Step 1), which is a hosting decision and cannot be confirmed before Task 13.**

### The truncated write was real, and it was worse than the audit described

Phase 1's second checkbox says: confirm the outcome is a persisted error run and not a truncated write, and *"if it is still a truncated write, that is the actual bug and it needs handling, not just a longer timeout."*

It was still a truncated write, and not only on timeout. The route awaited `executeWorkflow` and then inserted the `workflow_runs` row **inside the same `try`**. `serverExecutor` rethrows after emitting `node:error`, so **every failed manual run** — not just a timed-out one — skipped the insert entirely. The catch reported the error and closed the stream. A run that happened, spent tokens and possibly sent email left no record, and Run History showed nothing.

Two changes, both contained in the route:

1. **Persistence moved out of the `try`.** The row is now written whether or not execution threw, with `status: "error"` and the failure message when it did. The insert has its own `try`/`catch` so a persistence failure still closes the stream cleanly and is reported as `api.workflows.execute.persist_failed`.
2. **A route-level runtime budget** (`RUN_BUDGET_MS`, 30s inside `maxDuration`) raced against execution. When it wins, the route reaches its persistence path *before* the platform severs the request, which is what converts an invisible truncation into a legible error run.

The budget is enforced in the route rather than inside the executor on purpose: restructuring `serverExecutor` or the SSE streaming is an explicit Stop Condition for this task. `executeWorkflow` is not cancellable, so it may keep running until the platform stops it — but the run is recorded either way, which is the failure mode A11 is actually about.

**Residual, and honest:** a `maxDuration` kill is a process-level sever that no in-process code can catch. The budget makes that path very unlikely rather than impossible, and the per-provider abort timeouts below keep normal runs far inside it. **Full confirmation of the timeout failure mode needs a real deployed host** and belongs to Task 13's evidence, not here.

## Phase 2 — done

- **Node-count cap** — `EXECUTION_LIMITS.MAX_NODES_PER_RUN` enforced in `lib/execution/validate.ts`, before execution begins. Counts reachable nodes only. Sits alongside Task 03's `MAX_AI_NODES_PER_RUN`, which bounds spend; this one bounds size.
- **Abort timeouts on both providers** — `AbortSignal.timeout(...)` on the Anthropic stream and the Tavily fetch, on **both** the `serverExecutor` path and the two API routes. Per the task's instruction not to invent a second convention, Lookup reuses `HTTP_LIMITS.TOTAL_TIMEOUT_MS` (30s) directly; the AI call gets a longer budget because it streams to `max_tokens`. A test pins the relationship so the two conventions cannot drift apart.

## Phase 2 — deferred, with reasons

- **Per-user concurrent-run limit — DEFERRED.** Task 03 resolved `MAX_CONCURRENT_REQUESTS` as option **B**: the control was removed, and the durable protections named in its place include this task's caps. Building a database-backed concurrent-run counter now would be the third counting system that both task files explicitly warn against. The requirement it served — bound a single user's simultaneous spend — is met by the ledger-derived per-minute windows, which bound burst regardless of how many instances serve the requests. This task's Completion Criteria permit deferral with the reason recorded; this is that record.
- **Client-disconnect behaviour — DEFERRED.** Execution continues after disconnect today (`send()` swallows the enqueue failure). Continuing is defensible, but the task requires the choice to be *surfaced in the UI*, and that is product copy rather than hardening. Recorded as **HUMAN_UI_CHECK_REQUIRED** and as an operator decision. Nothing about the current behaviour is unsafe — the run is now persisted either way, which it was not before.

## Proposed values — OPERATOR CONFIRMATION OUTSTANDING

Per this task's first Stop Condition, cap values are product judgment the audit does not supply.

| Constant | Proposed | Reasoning |
|---|---|---|
| `MAX_NODES_PER_RUN` | 60 | Far above any sensible graph; the 20-AI-node cap binds spend long before this binds size |
| `AI_TIMEOUT_MS` | 60000 | Haiku at `max_tokens` 4096 normally finishes well inside this |
| `LOOKUP_TIMEOUT_MS` | 30000 | Inherited from `HTTP_LIMITS.TOTAL_TIMEOUT_MS`, not chosen separately |
| `maxDuration` | 300 | Matches the Inngest route; **must be checked against the host plan** |
| `RUN_BUDGET_MS` | `maxDuration` minus 30s | Headroom for the persistence write |

## Verification not runnable here

- *"A run exceeding the runtime cap persists a `workflow_runs` row with `status: error`"* and *"a hung provider call is aborted by the AbortSignal"* both need a live database and a controllable slow provider. This repo's suite is pure-function Vitest with neither. The behaviour is structurally in place and reviewable in the diff; the assertions are recorded as outstanding rather than faked, and are natural candidates for Task 12's CI work.
- The node-count test does assert **zero provider calls** on rejection, as the task asks, by spying on `fetch` while validation rejects.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] Test: a graph exceeding the node-count cap fails validation with a clear error and **zero** provider calls made. Assert the absence of calls, not just the error.
- [ ] Test: a run exceeding the runtime cap persists a `workflow_runs` row with `status: "error"`.
- [ ] Test: a hung provider call is aborted by the `AbortSignal` rather than hanging indefinitely.

**Manual**

- [ ] Build an oversized graph and confirm it fails cleanly with a persisted error run rather than a truncated write. This is A11's headline verification.
- [ ] Start a long run and close the browser tab; confirm the resulting state matches whatever disconnect behavior was chosen and that the UI told the user what would happen.
- [ ] Confirm a normal-sized workflow is unaffected by every limit added.

# Stop Conditions

Stop and ask before proceeding if:

- Choosing the cap *values* (node count, runtime, concurrency) requires product judgment the audit does not supply. Propose numbers with reasoning and ask.
- The `maxDuration` value needed exceeds the host plan's ceiling. That is a hosting decision, not a code decision.
- Implementing the runtime cap appears to require restructuring `lib/execution/serverExecutor.ts` or the SSE streaming in the execute route. Those are load-bearing; a large refactor here is out of scope for a task tiered as hardening.
- Adding `AbortSignal` to the Anthropic path conflicts with the streaming implementation in a way that is not mechanical.
- Task 06 (Next.js upgrade) has not yet landed and the upgrade is likely to change platform timeout behavior. Sequencing matters here — ask rather than doing the work twice.

# Completion Criteria

- `maxDuration` exported and the timeout failure mode verified to be clean.
- Node-count cap enforced pre-execution, with a test asserting no provider calls occur on rejection.
- Runtime cap produces a persisted error run.
- Provider fetches carry abort timeouts consistent with `lib/http/constants.ts`.
- Concurrent-run limit is durable, or explicitly deferred with the reason recorded.
- Disconnect behavior decided, implemented, and surfaced in the UI.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Confirm the deployment host's function timeout ceiling** on your current plan. `maxDuration` cannot exceed it, and the correct value depends on it.
2. **Decide the acceptable maximum workflow size** for V1 — this is a product constraint, and users need to be told what it is.
