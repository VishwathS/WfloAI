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

- [ ] Implement retention as an **Inngest cleanup function**, following the existing pattern in `lib/inngest/functions.ts`.
- [ ] Periods: runs 90 days, audit events 90 days, ledger 30 days past completion. **Never delete `pending` or `unknown` ledger rows younger than 7 days** — CLAUDE.md's own rule, and the reason is that an ambiguous row is evidence of a possibly-completed external action.
- [ ] Files: retain until user-deleted.
- [ ] Add **pagination** to `app/api/workflows/[id]/runs/route.ts` (this is also C4 — it belongs here since it is the same endpoint).
- [ ] Ensure the periods implemented **match what task 07's privacy policy states**. If they diverge, the policy is a false promise.

### B7 — CI

- [ ] GitHub Actions workflow running `lint`, `tsc --noEmit`, and `test` on pull requests.
- [ ] Add a `typecheck` script to `package.json`.
- [ ] Enable Dependabot.
- [ ] Add `npm audit` to CI. Decide deliberately whether it blocks or warns — a blocking audit that fires on an unfixable transitive advisory will be disabled within a week.

### B8 — README

- [ ] Correct the model and `max_tokens` claims.
- [ ] List all node types actually implemented.
- [ ] Reference all migrations, or stop enumerating them and point at the directory.
- [ ] Document every environment variable — coordinate with task 11, which produces the authoritative list.

### B10 — help

- [ ] A `/help` page. This is the audit's stated minimum; a tour and tooltips are nice-to-have beyond it.
- [ ] Document the Gmail Reply → Read parent requirement and the `{{previousOutput}}` vs `{{key}}` distinction. These two are the highest-value entries because they are the two the product currently hides.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] `npm run lint` clean.
- [ ] Test the retention function's boundaries: a 91-day-old run is deleted; an 89-day-old run is not; a `pending` ledger row 3 days old is **not** deleted even though it is past the 30-day completion rule's spirit.
- [ ] Test pagination returns correct pages and a stable ordering.
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
