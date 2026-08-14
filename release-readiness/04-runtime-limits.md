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
- **No per-user concurrent-run limit.** Note that `MAX_CONCURRENT_REQUESTS` in `lib/integrations/limits.ts:16` is in-memory and therefore a no-op on serverless — it does not provide this.
- **No `AbortSignal`** on the Anthropic or Tavily fetches. A hung provider call hangs the run.
- **Execution continues after client disconnect** (`app/api/workflows/[id]/execute/route.ts:101`). Closing the browser tab does not stop the workflow, and the user has no way to cancel.

The audit's judgment: this is reliability hardening, and small graphs will not hit these limits. It was re-tiered out of blocker status for that reason. But the `maxDuration` line specifically converts an invisible failure into a legible one, which is why it is pulled forward.

# Required Changes

### Phase 1

- [ ] `export const maxDuration = <n>` in `app/api/workflows/[id]/execute/route.ts`. Choose a value consistent with the host's plan limits and with `app/api/inngest/route.ts`, which already sets `maxDuration = 300`. One line.
- [ ] Confirm that when the duration is exceeded, the outcome is a persisted error run or a clean platform error — **not** a truncated write. If it is still a truncated write, that is the actual bug and it needs handling, not just a longer timeout.

### Phase 2

- [ ] Node-count cap enforced in `lib/execution/validate.ts`, so an oversized graph fails **before** execution begins rather than partway through having already spent tokens.
- [ ] Total runtime cap inside the executor, producing a clean error run when exceeded.
- [ ] `AbortSignal` with an explicit timeout on the Anthropic and Tavily calls. Coordinate with `lib/http/constants.ts`, which already defines 10s connect / 30s total for the HTTP node — match that shape rather than inventing a second convention.
- [ ] Per-user concurrent-run limit, **durable** (database-backed), not in-memory. Reuse the ledger mechanism task 03 extends rather than building a third counting system.
- [ ] Decide and implement behavior on client disconnect. Continuing is defensible for scheduled-style semantics; silently continuing while the user believes they cancelled is not. Whatever is chosen, make it explicit in the UI.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Test: a graph exceeding the node-count cap fails validation with a clear error and **zero** provider calls made. Assert the absence of calls, not just the error.
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
