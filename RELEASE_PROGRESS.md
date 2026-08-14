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
| 01-security-sweep | NOT STARTED | A4, A5, A6, A13, A15, B3 | — | — | — | A15 is the item not to skip — it decides whether V1 needs sensitive-scope verification or a full security assessment. A6's CSP half may defer to Phase 3. |
| 02-observability | NOT STARTED | A7 | — | — | — | Scope deliberately capped: reporter + swallowed catches + three failure-class log lines. Not an APM rollout. |
| 03-ai-lookup-quotas | NOT STARTED | A2, B11 | — | — | — | Two halves. Provider console caps are manual and should be done on day one, before any code. |
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
