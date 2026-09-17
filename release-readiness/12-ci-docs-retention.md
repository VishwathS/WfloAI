# Objective

The Phase 3 cleanup bundle: bound unbounded data growth, add the CI that should have existed from the start, fix documentation that is now actively misleading, and give users somewhere to learn how the product works.

None of these block launch individually. Together they are the difference between a product you can maintain and one that decays.

# Audit Items

**B2** (retention policy) · **B7** (CI and dependency hygiene) · **B8** (README is materially stale) · **B10** (help docs and onboarding)

# Current State

### B2 — nothing is ever deleted

`workflow_runs` stores **every node's full output text** with no retention limit. `app/api/workflows/[id]/runs/route.ts` returns **all rows** with no pagination — a heavy user's history will eventually make that endpoint unusable on its own.

CLAUDE.md already flags `integration_action_executions` and `integration_audit_events` as growing unbounded, and records the intended cleanup rule: audit events older than 90 days; ledger rows older than 30 days past completion, **never** `pending` or `unknown` rows younger than 7 days.

The audit's suggested V1 model: runs 90 days, audit 90 days, ledger 30 days past completion, files until user-deleted.

### B7 — no CI at all

There is **no `.github/` directory**. No CI, no Dependabot, no `npm audit` in any workflow. `npm test` and `npm run lint` gate nothing. There is no `typecheck` script.

Test coverage: nine Vitest files covering `lib/` pure functions reasonably well, and **zero tests touching any API route, middleware, auth, or RLS**. Every task in this plan asks for route-level tests; this task provides the harness that makes them meaningful.

### B8 — README asserts things that are false

`README.md:100` claims `claude-sonnet-4-20250514` and `max_tokens: 1024`. Both wrong — the code uses `claude-haiku-4-5-20251001` at `max_tokens: 4096`.

It also lists **3 node types** when there are seven-plus (missing Gmail, HTTP, Router, Lookup, File Input), references 2 of 10 migrations, and omits `TAVILY_API_KEY`, the Gmail OAuth variables, the Inngest keys, and `INTEGRATION_TOKEN_KEY`.

### B10 — no onboarding

`lib/templates/definitions.ts` holds 15 templates with a category-filtered gallery — good raw material, already built. But there is no tour, no tooltips, no first-run checklist, no user documentation, and no `docs/` folder.

Two behaviors are effectively undiscoverable: Gmail Reply's requirement that a Read Email node be its direct parent (statically enforced in `lib/execution/validate.ts`, but only discovered by hitting the error), and the distinction between `{{previousOutput}}` and `{{key}}`.

# Required Changes

### B2 — retention

- [x] Implement retention as an **Inngest cleanup function**, following the existing pattern in `lib/inngest/functions.ts`.
- [x] Periods: runs 90 days, audit events 90 days, ledger 30 days past completion. **Never delete `pending` or `unknown` ledger rows younger than 7 days** — CLAUDE.md's own rule, and the reason is that an ambiguous row is evidence of a possibly-completed external action.
- [x] Files: retain until user-deleted.
- [x] Add **pagination** to `app/api/workflows/[id]/runs/route.ts` (this is also C4 — it belongs here since it is the same endpoint).
- [x] Ensure the periods implemented **match what task 07's privacy policy states**. If they diverge, the policy is a false promise.

### B7 — CI

- [x] GitHub Actions workflow running `lint`, `tsc --noEmit`, and `test` on pull requests.
- [x] Add a `typecheck` script to `package.json`.
- [x] Enable Dependabot.
- [x] Add `npm audit` to CI. Decide deliberately whether it blocks or warns — a blocking audit that fires on an unfixable transitive advisory will be disabled within a week.

### B8 — README

- [x] Correct the model and `max_tokens` claims.
- [x] List all node types actually implemented.
- [x] Reference all migrations, or stop enumerating them and point at the directory.
- [x] Document every environment variable — coordinate with task 11, which produces the authoritative list.

### B10 — help

- [x] A `/help` page. This is the audit's stated minimum; a tour and tooltips are nice-to-have beyond it.
- [x] Document the Gmail Reply → Read parent requirement and the `{{previousOutput}}` vs `{{key}}` distinction. These two are the highest-value entries because they are the two the product currently hides.

# Implementation record (2026-09-16)

## B2 — retention, and the safety problem it creates

Periods live in `lib/retention/constants.ts` as one source of truth, and the sweep, its tests, **and the privacy policy all import them**. Task 12's Completion Criteria require the numbers in the code and in the policy to be identical; importing them is how that stays true rather than being re-checked by hand. Runs 90 days, audit events 90 days, ledger 30 days past settlement, files until the user deletes them.

Task 07 shipped the policy with a **Pending** callout saying run history was kept indefinitely because no period had been implemented. That callout is now replaced with the real numbers, including why an unresolved action record is held for at least seven days.

**The predicates are separate from the queries** (`lib/retention/plan.ts`) so the boundaries this task asks about are testable without a database: a 91-day-old run is deleted, an 89-day-old one is not, and a row exactly at the boundary is **kept** — an off-by-one there quietly deletes a day of history nobody agreed to lose.

Two things the sweep does that a naive one would not:

- **Settled ledger rows are measured from `updated_at`, not `created_at`.** A row that sat pending for two months and then succeeded yesterday is one day old for retention purposes. Measuring from creation would delete the record of an action that happened yesterday.
- **Unsettled rows (`pending`, `unknown`) are protected by an absolute floor**, and the floor is *asserted at runtime* rather than assumed, so a future edit cannot lower the period underneath it. CLAUDE.md's reasoning is the point: such a row is evidence that an external action may already have happened, and deleting it destroys the only thing stopping a retry from sending the same email twice. An unrecognised status is kept — a sweep should never be what decides the meaning of an unknown state.

### The sweep is off by default, deliberately

Deleting real user data is an irreversible production change, which is a hard stop. **This working copy has a live Supabase CLI project link**, so running `npx inngest-cli dev` with this function registered would have swept a *remote* database from a developer's laptop. `cleanupExpiredData` therefore refuses to run unless `RETENTION_CLEANUP_ENABLED` is exactly `"true"`, and a test asserts the flag is checked **before** any `.delete()` in the function body. The operator turns it on in the environment where deletion is actually intended — recorded below.

Each table is swept in its own `step.run`, so a failure in one does not silently skip the others on retry.

## B2 — pagination

`GET /api/workflows/[id]/runs` returned every row a workflow had ever produced, each carrying every node's full output text. It now takes `limit` (default 50, capped at 100) and `offset`, and returns `total`, `hasMore` and `nextOffset`.

The ordering is `created_at desc, id desc`. The tiebreaker is not decoration: two runs can share a `created_at` to the microsecond, and without it the same row can appear on two pages or on none.

The Run History sidebar was fetching everything, so leaving it alone would have silently truncated history to the newest page. It now appends pages behind a **Load older runs** control.

## B7 — CI

`.github/workflows/ci.yml` runs lint, typecheck, test and build on pull requests and on pushes to `main`, on Node 22 to match `engines`. A `typecheck` script was added — there was none. The build step passes placeholder Supabase values and needs no real secrets, because `instrumentation.ts` skips its check during `phase-production-build`.

**`npm audit` is deliberately non-blocking**, which is the decision the task asks to be made explicitly. Task 06 left nine transitive advisories that `npm audit fix` cannot resolve in this tree. A blocking audit that fires on an unfixable transitive advisory gets switched off within a week, and then nobody looks at it at all. It reports; a human decides.

`.github/dependabot.yml` groups minor and patch updates into one PR so the majors that need real attention are not buried, and **ignores framework majors** for `next`, `react` and `react-dom` — those are a planned migration with a manual regression checklist (task 06), not something to take from a bot PR.

**Scope held.** This is the harness, not the coverage. No tests were backfilled for the untested existing routes, middleware, auth or RLS; that gap is real, is recorded in MASTER section 7.7, and is not a launch blocker.

## B8 — README

Every claim the task names as false is corrected, and each was checked against the code rather than assumed:

| Claim | Was | Now |
|---|---|---|
| Model | `claude-sonnet-4-20250514` | `claude-haiku-4-5-20251001` |
| Token ceiling | `max_tokens: 1024` | `max_tokens: 4096` |
| Node types | three | all nine, named |
| Migrations | two of fourteen, by absolute path | the directory, in filename order, with the remote-push warning |
| Route protection | `middleware.ts` | `proxy.ts` |
| Dashboard path | `/` | `/dashboard` |

The execution notes were also wrong in substance, not just in detail — they described trigger and action steps as simulations and named `/api/execute` as the AI path. They now describe the real primary path, the Inngest path, and the server-execution-only rule for Gmail and HTTP. Scripts now list `typecheck` and `test` and point at CI. The environment documentation is the section task 11 wrote, which this task was asked to coordinate with rather than duplicate.

## B10 — `/help`

Public, in the marketing group, because a support page that requires a login is no use to someone who cannot get in. That is an addition to the auth allow-list, so it is asserted in `tests/publicPaths.test.ts` alongside the other public paths rather than left to inspection. Linked from the marketing footer and the dashboard sidebar.

The two behaviours the task calls out as the product's hidden ones lead the page:

- **Reply to Email needs a Read Email step as its direct parent** — with the reason (a reply resolves its target from the typed metadata a Read step emits, and an AI step in between produces text, which carries no message identity), the working shape, and the fix that an AI step can still be in the chain but not between those two.
- **`{{previousOutput}}` vs `{{key}}`** — what each resolves to, that mentioning `previousOutput` suppresses the automatic context block so text is not sent twice, and that `{{input}}` is the deprecated spelling.

It also covers the steps, schedules, limits and retention. **Every number on the page is imported from the module that enforces it** rather than typed in, so the documentation cannot drift from the product — including the note that a Router step is an AI call and counts against the AI limit, which is the one that surprises people.

## Outstanding

- **Decide and confirm the retention periods** (Manual Step 1). They are implemented as proposed values and stated in the privacy policy; if a published policy ever says different numbers, the policy wins until amended.
- **Set `RETENTION_CLEANUP_ENABLED=true`** in the environment where deletion is intended. Until then the sweep is a no-op by design. Do not set it anywhere pointed at a database you are not willing to have swept.
- **Confirm CI runs on a pull request** by opening a throwaway one and watching it. The workflow cannot be observed from a local branch that has never been pushed.
- **Enable branch protection** to require the CI checks (Manual Step 3). A workflow that does not block is a notification, not a gate.
- **Confirm Dependabot opens PRs** and review the first ones before any auto-merge (Manual Steps 2 and 4).
- **HUMAN_UI_CHECK_REQUIRED:** read `/help` and judge whether the Reply-parent rule and the variable distinction are explained clearly enough that a new user would not hit the error; and read the README against the code once more, since it was wrong in ways a casual reader would not catch.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] `npm run lint` clean.
- [x] Test the retention function's boundaries: a 91-day-old run is deleted; an 89-day-old run is not; a `pending` ledger row 3 days old is **not** deleted even though it is past the 30-day completion rule's spirit.
- [x] Test pagination returns correct pages and a stable ordering.
- [ ] Confirm CI actually runs on a pull request — open a throwaway PR and watch it.

**Manual**

- [ ] Read the README against the code and confirm every claim is true. It is currently wrong in ways that a casual reader would not catch.
- [ ] Confirm the retention periods in the privacy policy and in the code are the same numbers.
- [ ] Load `/help` and confirm the two undiscoverable behaviors are explained clearly enough that a new user would not hit the error.
- [ ] Confirm Dependabot opens PRs.

# Stop Conditions

Stop and ask before proceeding if:

- The retention migration or cleanup function would run against **production data**. Deleting real user data is an irreversible production data change — a hard stop. Test against a local or staging database.
- The retention periods have not been decided by the operator, or do not match the published privacy policy. Do not pick numbers unilaterally; the policy is a commitment.
- Enabling `npm audit` in CI surfaces advisories that require dependency upgrades beyond this task's scope — particularly if they overlap task 06.
- CI setup requires repository secrets or GitHub organization settings changes.
- The help documentation would need to describe behavior you cannot verify from the code.

# Completion Criteria

- Retention implemented as an Inngest function with the specified periods and the `pending`/`unknown` protection, covered by boundary tests.
- Pagination on the runs endpoint.
- CI running lint, typecheck, and test on PRs, verified on a real PR.
- Dependabot enabled and observed opening a PR.
- README accurate — every claim verified against code, not assumed.
- `/help` live and covering at minimum the Reply-parent rule and the variable-syntax distinction.
- Retention periods identical in code and in the privacy policy.
- All verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Decide the retention periods** and confirm they match the published privacy policy. If the policy is already live with different numbers, the policy wins until it is amended.
2. **Enable Dependabot** in the repository settings.
3. **Configure branch protection** to require the CI checks, if you want them to actually gate merges. A CI workflow that does not block is a notification, not a gate.
4. **Review the first Dependabot PRs** before enabling any auto-merge.
