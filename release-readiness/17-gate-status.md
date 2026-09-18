# Task 17 — Launch gate status (preliminary)

Evaluated 2026-09-17 against the repository at `87a4ea6`; gates 2, 4, 8 and 15 re-read at `d78e84d` and read-only
production state. **Verdict: NOT READY.** This is an early reading so the path to
go-live is visible; the authoritative evaluation happens after Task 16, and every
gate is re-checked then.

| # | Gate | Status | Why / what unblocks it |
|---|---|---|---|
| 1 | Hardening (Tasks 01–12) | **FAIL** | All twelve are `IN PROGRESS` with operator items outstanding (RELEASE_PROGRESS). The code for A4/A5/A13/A15 and the Next 16 upgrade has landed; their operator and manual checks have not. Each needs completing or a named waiver |
| 2 | Production deployment | **FAIL** | Dev/prod separation done; production ledger reconciled 2026-09-18 (16/16, dry-run up to date); Vercel project `wfloai` created 2026-09-18, Git-linked, 0 deployments; awaiting production env vars + first-deploy approval (DEPLOYMENT.md §2, §6); 0/18 evidence items (Task 13) |
| 3 | Inngest signing key | **FAIL** | No deployment to POST to. The repo now refuses to boot with `INNGEST_DEV` in production, which protects this gate once deployed |
| 4 | Google OAuth | **FAIL** | Fresh send-only connect fixed in code (`fee570c`, `openid email gmail.send` + OIDC userinfo) but not deployed or proven against real Google; no Console evidence; client separation unconfirmed; verification not submitted; custom domain possibly required (`GOOGLE_CUSTOM_DOMAIN_MAY_BE_REQUIRED`) |
| 5 | Gmail scope send-only | **FAIL (repo side PASS)** | Code requests only `gmail.send` and now refuses `tier=read` while the flag is off (tested). Console evidence is missing, and the one live connection holds `gmail.compose` |
| 6 | Production E2E | **FAIL** | Task 15 not started; `CERTIFICATION_COMMIT` unset |
| 7 | Human UI acceptance | **FAIL** | Task 16 not started. Known Blocker candidate: no small-screen notice |
| 8 | Legal | **FAIL** | DRAFT banners present (correctly); no counsel review recorded. Contact address now supplied (`vishwath@ucsb.edu`, `d78e84d`); the privacy draft's Gmail-scope sentence changed and needs counsel review too. Retention periods are imported from `lib/retention/constants.ts`, so policy = code |
| 9 | Cost controls | **FAIL** | Durable quotas and per-run/schedule caps are live in code and schema; provider console caps on **production** keys are not evidenced (no production keys yet) |
| 10 | Observability | **FAIL** | No error-reporter vendor; structured stderr only. Needs a vendor (plus a privacy-policy entry) or a named waiver accepting logs-only |
| 11 | Signup gating decision | **FAIL — operator decision** | The invite-only gate is live. Needed: the launch scope as a number (e.g. "invite-only, cap N"). The per-user figure exists as an **estimate** (Task 03: ~$0.49 light / $4.26 heavy per user per month; worst case $5.72/user/day at the caps) — acceptable for a capped or invite-only launch; open signup would need a measured figure (Task 17 Manual Step 11) |
| 12 | Account deletion | **FAIL** | Shipped in code; not verified on a test account in production (Task 15 row 57) |
| 13 | Rollback | **FAIL** | `docs/RUNBOOK.md` exists (Task 13). Not reviewed against a deployed environment and not rehearsed — nothing is deployed to roll back |
| 14 | Data safety | **FAIL** | Backups and retention not evidenced; no recorded two-place backup or restore test of `INTEGRATION_TOKEN_KEY` |
| 15 | Support path | **FAIL** | Address chosen and published consistently (privacy, terms, `/help#contact`, RUNBOOK, pinned by `tests/supportContact.test.ts`); not yet shown to be monitored, and `<OPERATOR_NAME>` unconfirmed |
| 16 | Smoke test ready | **PASS (prepared)** | Task 17 §4 smoke list plus DEPLOYMENT.md §5 commands, matched to the option-(b) health check (`GET /api/credentials` → 401) |

## Not gates (do not let them become gates)

- D1 restricted scopes / CASA — deferred; Gate 5 passes *because* none is requested.
- C1–C10 — deferred; recorded in Task 16, not fixed.

## Terminal state

`READY FOR HUMAN GO-LIVE`: **No.** The agent does not launch in any case.

## Update 2026-09-18 — after first deployment (`6a331b5`, `wfloai.vercel.app`)

| # | Gate | Status now | Remaining |
|---|---|---|---|
| 2 | Production deployment | **FAIL (12/18 evidence rows PASS or N/A)** | Task 13 rows 6, 10, 13, 14, 16, 17 |
| 3 | Inngest signing key | **FAIL (2 of 3)** | unsigned POST rejected ✓; `INNGEST_DEV` absent ✓; event publishing (Run now → run row) open |
| 16 | Smoke test ready | **PASS** | unchanged |

Other gates unchanged; the authoritative evaluation follows Tasks 15/16.
