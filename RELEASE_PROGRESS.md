# WfloAI — Public V1 Release Progress

Tracking table for the release-hardening plan in [`release-readiness/MASTER.md`](release-readiness/MASTER.md).

Update this file after each completed task. **Manual and external actions are recorded separately from code work** — an external step performed by the operator is never marked as agent-completed work, and a task is never marked `COMPLETE` while any required verification has failed.

## Status legend

| Status | Meaning |
|---|---|
| `NOT STARTED` | No work begun. |
| `IN PROGRESS` | Work begun, not finished. |
| `BLOCKED` | Stopped on a hard stop, an unanswered question, or an external dependency. Record what is blocking in Notes. |
| `COMPLETE` | All `Required Changes` satisfied, all three verification commands green, `git diff` reviewed, and every manual step either performed or explicitly recorded as outstanding. |

`COMPLETE` requires all three of the following to have passed:

```
npm test
npx tsc --noEmit
npm run build
```

## Progress

| Task | Status | Audit IDs | Commit | Verification | Manual Actions | Notes |
|---|---|---|---|---|---|---|
| 01-security-sweep | IN PROGRESS | A4, A5, A6, A13, A15, B3 | `5d65054` | 2026-09-15: `npm test` 89 passed (11 files) · `npx tsc --noEmit` clean · `npm run build` succeeded | 4 outstanding — see Notes | **Autonomous work complete and verified; not COMPLETE.** Landed: A4 (middleware inverted to an allow-list + `getUser()` guard on `/settings`), A5 (shared `safeRedirectPath` helper in both call sites + `exchangeCodeForSession` error now handled), A13 (migration `202609150001` authored and reviewed — **not applied to any remote database**), A15 (`gmail.compose` removed from the initial connect tier, Create Draft moved behind the restricted gate, CLAUDE.md scope classification corrected), A6 Phase 1 (security headers + `global-error.tsx` no longer renders `error.message`), B3 (`isSameOrigin` helper applied to `POST /api/integrations/gmail/disconnect`). **A6 Phase 3 (full CSP) deferred to Phase 3** — the task's one explicitly permitted carve-out. **A13 deviation:** the audit assumed both ledger write paths bypass RLS; manual runs actually pass the *user-scoped* client, so dropping UPDATE would break `markActionSucceeded` *after* a real send. DELETE is dropped outright; UPDATE is constrained to rows whose current status is `pending` or `failed`, which closes the `succeeded`→`failed` re-send primitive while preserving every transition the app performs. Rationale recorded in the task file's `# Current State` A13 section. **Blocking COMPLETE (operator-only):** (1) Google Cloud Console consent screen must show `gmail.send` and no Restricted scope; (2) normal-authenticated-user RLS denial test for UPDATE and DELETE on `integration_action_executions`, which needs migration `202609150001` applied first; (3) apply that migration; (4) `curl -I` header check against the real domain post-deploy. HUMAN_UI_CHECK_REQUIRED: logged-out `/settings` redirect in a private window, and the Gmail node dropdown no longer offering Create Draft. |
| 02-observability | IN PROGRESS | A7 | `b0d726c` | 2026-09-15: `npm test` 95 passed (12 files) · `npx tsc --noEmit` clean · `npm run build` succeeded | 4 outstanding — see Notes | **Vendor-neutral half complete and verified; BLOCKED on a hard stop for the rest.** Landed: structured logger (`lib/observability/logger.ts`) that redacts context through `lib/integrations/redact.ts` and never throws into the request it reports on; `reportError()` facade with a single `setErrorTransport()` wiring point; `apiError()` helper; the three required failure-class events (`scheduled_run.failed`, `gmail.send.failed`, `http.mutation.failed`); 8 security-relevant swallowed catches now reported (enumerated in the task file, along with the 36 deliberately left silent); 23 raw-Postgres `error.message` leaks across 11 routes replaced with a generic client message plus full operator-side detail; client boundaries `app/error.tsx` and `app/global-error.tsx` wired to the facade, agreeing with task 01's `error.message` removal. **Two defects found and fixed during implementation:** `redactSensitiveKeys` recurses without cycle detection, so circular log context blew the stack *inside* redaction — the logger now drops context entirely rather than logging it unredacted (fails closed); and `countWorkflowsUsingCredential` interpolated Postgres detail into a thrown message. **BLOCKED:** Required Change 1 (wire an external reporter) needs a vendor account and a DSN secret — creating or exposing secrets is a MASTER §7.1 hard stop and the task's own first Stop Condition. Vendor choice is also a **task 07 dependency**: an error reporter capturing request context is a subprocessor the privacy policy must name. **Operator actions:** (1) choose the reporter and create the account/project; (2) provision the DSN in the host environment (never committed); (3) register it via `setErrorTransport()`; (4) confirm its data-retention setting and set up a notification channel. All five Manual verifications depend on (1)–(3). |
| 03-ai-lookup-quotas | IN PROGRESS | A2, B11 | `__TASK03_SHA__` | 2026-09-15: `npm test` 107 passed (13 files) - `npx tsc --noEmit` clean - `npm run build` succeeded | 5 outstanding - see Notes | Three halves. Provider console caps are manual and should be done on day one, before any code. Also owns the per-user **unit-cost** method (distinct from spend caps; feeds Task 17 Gate 11) and the forced A/B resolution of `MAX_CONCURRENT_REQUESTS`. **Half 2 (code) complete and verified.** Migration `202609150002` adds `input_units`/`output_units` to the ledger and an **atomic** `consume_action_quota` (advisory-locked count-and-insert; a row is inserted `pending` before the provider is called and settled after). AI and Lookup now consume that one mechanism. **Metering covers the primary path, not just the two named routes** - `serverExecutor` calls Anthropic and Tavily directly, so `/api/execute`, `/api/lookup`, the AI node, the **Router node** (an AI call that was easy to miss) and the Lookup node are all metered; AI/Lookup nodes now refuse to run without an `IntegrationContext`, so no path executes a spending node unmetered. Per-run AI-node cap in `validate.ts`; `consumeRunAction` wired for AI and Lookup. **`MAX_CONCURRENT_REQUESTS` resolved as B** - removed, with the durable protections named in code and in the task file. Task 15 should certify B. **B11:** AI/Lookup are atomic; **Gmail/HTTP deliberately are not** - making them atomic requires restructuring `claimAction`, an explicit Stop Condition. Residual race documented with its bound (at most concurrent-minus-one past the limit, cannot compound, not a duplicate-send risk). `gmail.draft` omission moot under A15. **Half 3:** re-runnable SQL + price constants (`lib/integrations/pricing.ts`, read 2026-09-15, **operator must verify**). Pre-launch **ESTIMATE**: $0.0055/AI call, $0.49/light user/month, $4.26/heavy user/month, worst case at the caps **$5.72/user/day**. Basis and limitations recorded in the task file; labelled an estimate, derived from evidence available now, **not** waiting on Phase 1 or Task 15. **Blocking COMPLETE (operator-only):** (1) Anthropic console spend cap; (2) Tavily console cap; (3) billing alerts on both; (4) confirm the **proposed** quota values (AI 20/min, 200/day; Lookup 10/min, 100/day; 20 AI nodes/run) - Stop Conditions make the final numbers the operator's call; (5) apply migration `202609150002`. **Outstanding tests:** the N+1 -> 429 and quota-boundary concurrency tests need a live Postgres, which this repo's suite has no fixture for; recorded in the task file as outstanding rather than faked. **NOTE:** the task file's implementation record is **uncommitted** - it sits on top of pre-existing uncommitted edits to that file and could not be separated without committing your work. |
| 04-runtime-limits | NOT STARTED | A11 | — | — | — | `maxDuration` is a one-line Phase 1 change; the rest is Phase 2. |
| 05-schedule-limits | NOT STARTED | A12 | — | — | — | Must preserve the CAS claim's exactly-one-winner semantics. |
| 06-nextjs-upgrade | NOT STARTED | A9 | — | — | — | Longest pole. Start early, run alongside doc tasks. Full manual regression checklist required — a green build is not sufficient. |
| 07-landing-legal | NOT STARTED | A1, B1 | — | — | — | Every legal page ships with a DRAFT banner. Banner removal is a human action after review. |
| 08-signup-gating | NOT STARTED | A3 | — | — | — | Gate must cover the money-spending API routes, not just pages. |
| 09-account-deletion | NOT STARTED | A8 | — | — | — | Deletion order is load-bearing: revoke at Google → delete Storage → delete auth user. Test accounts only. Admin-client exception already granted in CLAUDE.md and narrowly scoped — target `user_id` from `auth.getUser()`, never client input. |
| 10-gmail-consent | NOT STARTED | A14a, B14b, D1 (flag-off only) | — | — | — | Depends on task 01's A15 landing first. All send tests to own address only. |
| 11-production-config | NOT STARTED | A10, B5, B6, B9 | — | — | — | Almost entirely manual. Contains the plan's most important verification: unsigned POST to production `/api/inngest` must be rejected. |
| 12-ci-docs-retention | NOT STARTED | B2, B7, B8, B10 | — | — | — | Retention periods must match the published privacy policy exactly. |

## Manual / external action log

Record operator-performed actions here as they happen. These are **not** agent work and must never be marked complete by an agent.

| Date | Action | Task | Performed by | Notes |
|---|---|---|---|---|
| — | — | — | — | — |

## Deferred

C1–C10, D2, D3, D4, and the full D1 restricted-scope program are deferred to Phase 4. See [`release-readiness/MASTER.md`](release-readiness/MASTER.md) §6. Do not implement them during V1 hardening.
