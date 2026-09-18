# Objective

Turn a hardened repository into a **verified production environment**, and produce evidence that it is wired correctly.

Entry state: `HARDENED`. Exit state: `PRODUCTION READY`.

This task does **not** prove the product works. It proves the environment *exists, is configured, and is reachable*. Whether workflows actually run end-to-end in that environment is Task 15, and that separation is deliberate — an environment that is correctly configured but functionally broken and an environment that is functionally fine but misconfigured fail in completely different ways and are found by completely different checks.

### Relationship to Task 11 — read this before starting

Task 11 and Task 13 overlap by design and must not duplicate work:

| | Task 11 (`11-production-config.md`) | Task 13 (this file) |
|---|---|---|
| Owns | Repository-side artifacts: `.env.local.example` declarations, the README env section, the startup check, the `INTEGRATION_TOKEN_KEY` recovery doc, and the written operator checklist | **Execution and evidence** of that checklist against the real production environment |
| Produces | Documentation and code | Verified state + recorded proof |

If a Task 11 repo edit is still outstanding, **finish Task 11 first**. Do not re-do Task 11's edits here. Conversely, Task 11 is not "complete" merely because Task 13 later verified something — its own criteria stand.

Google Cloud production OAuth is **Task 14**, not this task. Task 11's `# Manual / External Steps` §Google Cloud items (12–19) are superseded by Task 14 and should be executed there, so the Gmail consent screen, scope justification, and verification submission all live in one place with one owner.

# Audit Items

**LAUNCH-13** — a launch-extension ID, not an original audit ID. It does not change the meaning or mapping of any A/B/C/D item.

Completes the operator side of **A10** (Inngest signing key verified in production), **B5** (Supabase production config), **B9** (`INTEGRATION_TOKEN_KEY` backup), and the non-Gmail half of **B6**.

**Prerequisites:** Tasks 01, 02, 04, 05, 06, 11 complete. Task 03's provider console caps done (Phase 0). Deploying an unhardened application to a public URL is the thing this whole plan exists to prevent.

# Current State

Facts below were read from the repository. If any has changed, update this section and say so rather than implementing against it.

### There is no deployment configuration in the repository at all

`ls` of the repo root shows **no `vercel.json`, no `.github/`, no `Dockerfile`, no `fly.toml`, no `render.yaml`** — no host configuration of any kind. `grep -niE "vercel|deploy|hosting"` across `README.md`, `CLAUDE.md`, and `.env.local.example` returns **zero hits**.

The consequence matters: **the choice of host is not encoded anywhere in the repository.** Every production behavior that depends on the host — function timeout, region, Node version, header handling, build command — is an out-of-band setting that nothing in the repo will contradict if it drifts. This task is where that gets written down.

### Runtime declarations that exist, and the one that does not

```
app/api/inngest/route.ts:7                 export const maxDuration = 300
app/api/workflows/[id]/files/route.ts:6    export const maxDuration = 60
app/(dashboard)/page.tsx:8                 export const dynamic = "force-dynamic"
app/(dashboard)/settings/page.tsx:4        export const dynamic = "force-dynamic"
app/(dashboard)/workflows/[id]/page.tsx:11 export const dynamic = "force-dynamic"
```

`app/api/workflows/[id]/execute/route.ts` — the primary SSE run path — declares **no `maxDuration`**. It inherits the platform default, which on serverless hosts is short relative to a multi-node AI chain. This is **A11 / Task 04's Phase 1 one-liner**, and it is the single most likely production-only failure in the product: locally the run finishes, in production it is cut off mid-stream and no `workflow_runs` row is written, because the insert happens after the stream drains.

**Task 04 must be complete before this task deploys anything.** If it is not, record that as a blocker rather than deploying and discovering it in Task 15.

### Node version is pinned in the repo but not on the host

`package.json` declares `"engines": { "node": ">=22 <23" }`. The host has its own Node setting. `unpdf`, `mammoth`, and `undici` are all native-adjacent or version-sensitive; a host running a different major is a silent behavior difference, not a build error.

`next.config.mjs` sets `serverComponentsExternalPackages: ["mammoth"]` — file extraction depends on `mammoth` being externalized rather than bundled. If a host's bundler behaves differently, DOCX extraction is where it shows up.

### Scripts available

```
dev | build | start | lint | test
```

There is **no `typecheck` script** (Task 12 / B7 adds it). A host build command of `npm run build` therefore does not type-check — `next build` does, but do not rely on it as the sole gate.

### Environment variables — the repo-grep list is incomplete on purpose

Grepping `process.env.*` across `app/`, `lib/`, `components/`, `middleware.ts` yields exactly:

```
ANTHROPIC_API_KEY
GMAIL_READ_ACTIONS_ENABLED
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
INTEGRATION_TOKEN_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
NODE_ENV
SUPABASE_SERVICE_ROLE_KEY
TAVILY_API_KEY
```

**`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `INNGEST_DEV` do not appear** — the Inngest SDK reads them from the environment itself, not through application code. A startup check built by grepping application code would therefore **miss both Inngest keys**, including the one that is a security control. Task 11's startup check must list them explicitly; verify that it does.

Task 02 adds an error-reporter DSN to this list.

### `INNGEST_DEV=1` is a production footgun sitting in the example file

`.env.local.example` ends with:

```
# Local Inngest dev server (npx inngest-cli dev). Unset in production, where
# INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY are used instead.
INNGEST_DEV=1
```

If that variable is copied into the production environment, the SDK runs in dev mode and **signature verification does not apply** — which silently defeats A10 even when `INNGEST_SIGNING_KEY` is correctly set. The unsigned-POST test catches it; nothing else does.

### Migrations provision the Storage bucket, so "apply all ten" is not optional

`supabase/migrations/` contains ten files. `202607050001_add_workflow_files.sql:47` performs `insert into storage.buckets (id, name, public)` and then creates three `storage.objects` policies keyed on `(storage.foldername(name))[1] = auth.uid()::text`.

The private `workflow-files` bucket and its RLS therefore **do not exist in a production project until that migration runs**. B5's "confirm the bucket is private" is a verification of migration state, not of a dashboard toggle.

`202605150001_add_execution_logs.sql` creates the retired `execution_logs` table. It is unreferenced (CLAUDE.md records this) and harmless; apply it anyway to keep the migration ledger linear. Dropping it is C6, deferred.

### A Supabase CLI project link already exists

`supabase/.temp/` contains `linked-project.json`, `project-ref`, `pooler-url`, and version stamps. **The CLI in this working copy is linked to a remote project.**

This is the sharpest hazard in this task: `supabase db push` from this directory targets that **remote** project, whichever one it is. It is a remote migration application and therefore a hard stop under MASTER §7.1. Confirm which project the link points at before running any CLI command that writes.

### Origin is derived per-request, so every origin needs registering

```
app/api/integrations/gmail/connect/route.ts:26   const redirectUri = `${requestUrl.origin}/api/integrations/gmail/callback`
app/api/integrations/gmail/callback/route.ts:70  redirectUri: `${requestUrl.origin}/api/integrations/gmail/callback`
app/auth/callback/route.ts                       NextResponse.redirect(new URL(safeNext, requestUrl.origin))
components/auth/login-card.tsx:23                const redirectTo = `${window.location.origin}/auth/callback?...`
```

There is **no `NEXT_PUBLIC_APP_URL` or site-URL variable** pinning the canonical origin. Consequences, both real:

1. **Every distinct origin that serves the app produces a different OAuth redirect URI.** Apex vs `www`, the host's generated `*.vercel.app` domain, and every preview deployment are separate origins. Google and Supabase both require exact registration — preview deployments will fail OAuth unless explicitly registered, and registering ephemeral preview origins is not practical.
2. The canonical production origin must be settled **before** Task 14 registers redirect URIs, or Task 14 registers the wrong thing.

Decide the canonical origin in this task. Whether to introduce a pinned site-URL variable is a legitimate question to raise — but it is a code change, so it belongs to whichever task the operator assigns it to, not silently to this one.

# Required Changes

## 1. Autonomous — repository-side preparation

These are safe to complete without any production access. None of them deploy, and none take effect until a human deploys.

- [ ] **Regenerate the environment-variable inventory from the repository**, not from this document or from memory. Run the `process.env` grep above, add the SDK-implicit Inngest variables and Task 02's reporter DSN, and reconcile against `.env.local.example` and the README section Task 11 produced. Record any variable that is read by code but undeclared, or declared but unread — either direction is a defect.
- [ ] **Confirm Task 11's startup check explicitly lists `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`.** They are invisible to a code grep. If the check was generated from a grep, it is incomplete and that is a Task 11 defect to record and fix there.
- [ ] **Confirm `maxDuration` is declared on `app/api/workflows/[id]/execute/route.ts`** (Task 04's Phase 1 item). If it is absent, this task is blocked — say so and stop rather than deploying.
- [ ] **Write the canonical-origin decision into the repository** — which exact origin is production (apex or `www`), what redirects to what, and the explicit statement that preview deployments are **not** OAuth-capable unless separately registered. Task 14 consumes this.
- [ ] **Prepare host configuration as a reviewed file, do not apply it.** If the operator has chosen a host, a committed config file (e.g. `vercel.json`) is legitimate repository work — but it takes effect at the next deploy, so it must be written deliberately and reviewed in `git diff`, never added as an incidental. State in the file's PR description exactly which production behavior each key changes.
- [ ] **Produce the migration-parity procedure**: the exact command sequence to list which of the ten migrations a target project has applied, and to compare that list against `supabase/migrations/`. The agent writes the procedure; the human runs it against production.
- [ ] **Decide the health-check approach** — see the Stop Condition below. Task 17's smoke test needs a cheap liveness signal. The two options are (b) **no new route**, with the smoke test driving an existing authenticated route using a real session, or (a) an unauthenticated `/api/health` returning a bare `{ "ok": true }` with no version, no environment, and no dependency detail.

  **Prefer (b).** Option (a) requires recording a **second** documented exception to CLAUDE.md's "every `app/api/` route must call `supabase.auth.getUser()`" invariant, and that invariant is load-bearing — it is what makes "is this route authenticated?" answerable without reading every route. Health endpoints being conventional is not a reason to weaken it. Take (a) only if production readiness genuinely cannot be verified without it — and if so, get explicit sign-off first and record the exception in CLAUDE.md the same way the `/api/inngest` exception is recorded, naming why (b) was insufficient. "Simpler to operate" is not that reason.

- [ ] **Author the V1 operations runbook** as a repository artifact (`docs/RUNBOOK.md`). This is documentation, not infrastructure — it takes no production action and creates no new mechanism. It has exactly two sections, both scoped to V1:

  **1. Rollback and recovery.** How to roll back to the prior deployment on the chosen host. How to re-enable the signup gate (Task 08). The restore path for `INTEGRATION_TOKEN_KEY` (Task 11 / B9) and for the database from backups. Who to contact at each provider — host, Supabase, Inngest, Anthropic, Tavily, Google — with the account identifier needed to open a ticket. And, stated explicitly, **what cannot be rolled back**: an applied migration (absent a written-in-advance down path), a sent email, a created account, and a public announcement.

  **2. Support and incident path.** Deliberately minimal. **The requirement is not to build a support platform** — no ticketing system, no status page, no on-call rotation, no new UI. Five things in writing:

  - **How a user reports a problem** — the monitored contact address Task 07 already requires for its privacy policy, and where in the product a user can find it.
  - **Where that report goes** — the specific inbox or channel, the same one Task 02's notification channel uses. One address, not a second one nobody watches.
  - **How the operator responds** — acknowledge, assign a severity, and the pointer to containment below.
  - **How dangerous scheduled or integration behavior is contained** — using only switches that already exist: disable a schedule or a user's schedules (Task 05), flip `GMAIL_READ_ACTIONS_ENABLED`, delete or replace a stored credential, re-enable the signup gate (Task 08), tighten the provider budget caps (Task 03), or roll back per section 1. Name the exact action for each, so nobody is improvising while something is actively sending mail.
  - **What basic incident information to capture** — time and duration, affected users, the workflow and run ids involved, which external side effects actually occurred (emails sent, HTTP mutations fired), and which containment step was taken.

  Writing this is autonomous work. **Rehearsing** any of it involves production actions and stays human-gated — Task 17 Gate 13 covers the rehearsal, and Task 17 *verifies* this document rather than writing it.

  **This does not block on Task 07.** The contact address is an operator-supplied value (Task 07's Manual step 6), not a Task 07 deliverable that must land first — Task 13 runs at Phase 1 entry and Task 07 lands in Phase 2. Write the runbook now with the address recorded as outstanding if the operator has not chosen one yet; Task 17 Gate 15 is where it must actually be live, monitored, and matching the published policy. An unfilled field here is a note, not a blocker, and it must not stall Task 13.

## 2. Manual / external — human only

Fully enumerated in `# Manual / External Steps`. The agent documents the click-path and stops.

## 3. Post-action verification

Every item in `# Verification` under **Production evidence** must be performed against the deployed environment and its result recorded in `RELEASE_PROGRESS.md` under Manual Actions — not summarized as "configured".

# Verification

**Automated — runs anywhere, proves the build is deployable**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds **with the production environment variable names present** (values may be placeholders) — a build that succeeds only because a variable was absent is not evidence.
- [ ] Task 11's startup check fails as designed when `INNGEST_SIGNING_KEY` is removed from a production-mode environment. This is the check that protects A10 from a config regression.

**Production evidence — required, each produces an artifact**

Completion requires the artifact, not the assertion. "Configured" is not evidence; the recorded output is.

| # | Check | Evidence to record |
|---|---|---|
| 1 | The production URL serves the app over HTTPS on the canonical origin | `curl -I https://<canonical-origin>` output, showing 200/redirect and the TLS-terminated response |
| 2 | Non-canonical origins redirect to canonical | `curl -I` on apex and `www`, showing which redirects to which |
| 3 | Security headers present in production (Task 01 / A6) | `curl -I` output showing HSTS, `nosniff`, `Referrer-Policy`, frame-ancestors deny. A local check does not prove the host isn't stripping them |
| 4 | **Unsigned POST to production `/api/inngest` is rejected** | The request and the rejection response. MASTER §4.1: this validates the **signing** key only |
| 5 | `INNGEST_DEV` is **absent** from the production environment | Screenshot or listing of the production env var names. If present, item 4's result is meaningless |
| 6 | Event publishing works | A schedule "Run now" that produces a `workflow_runs` row. This validates the **event** key; item 4 says nothing about it |
| 7 | The app is synced to Inngest Cloud and both functions (`checkDueSchedules`, `runScheduledWorkflow`) are registered | Inngest dashboard listing |
| 8 | All ten migrations applied to the production project, in order | Output of the migration-parity procedure |
| 9 | `workflow-files` bucket exists and is **private** in production | Supabase dashboard bucket listing |
| 10 | Storage RLS enforced in production: a signed-in user cannot read an object under another user's `{user_id}/` prefix | The denied request |
| 11 | RLS enforced on all nine tables in production | Per-table confirmation. Do not sample — RLS is the only access control |
| 12 | Supabase Auth Site URL and Redirect URL allow-list contain the canonical production origin | Dashboard screenshot |
| 13 | Anthropic and Tavily production keys are **distinct from development keys**, with console budget caps set (Task 03, Phase 0) | Console screenshots of both caps |
| 14 | `INTEGRATION_TOKEN_KEY` in production is stored in two independent places **and has been restore-tested once** | Written record of the restore test. An untested backup is not a backup |
| 15 | `GMAIL_READ_ACTIONS_ENABLED` is `false` in production (Task 10 / D1) | Production env listing. Verify; do not assume |
| 16 | Backups enabled with a known retention period | Supabase dashboard |
| 17 | Error reporting (Task 02) receives a deliberately triggered production error | The event visible in the reporter |
| 18 | Node major version on the host matches `engines` (22.x) | Build log |

# Stop Conditions

Stop and hand over — do not proceed — if:

- **Any deploy to production is the next action.** Hard stop under MASTER §7.1. The agent prepares the build and the commands; a human runs them.
- **Any migration would be applied to a remote database.** Hard stop. This working copy has a **live Supabase CLI project link** (`supabase/.temp/linked-project.json`), so `supabase db push` and equivalents target a remote project from this directory with no additional flag. Confirm the link target before running any CLI command that writes, and do not run one.
- **Any secret would be created, exposed, replaced, or rotated** — including generating `INTEGRATION_TOKEN_KEY` or the Inngest keys. Hard stop.
- **Any production infrastructure setting would change** — host project settings, domains, Supabase plan or network restrictions, Inngest environment config.
- **Provider billing or budget settings would change.** Hard stop.
- Task 04's `maxDuration` on the execute route has not landed. Deploying without it means Task 15 will discover it as a mysterious production-only truncation. Record it as a blocker.
- **The health-check decision requires adding a second CLAUDE.md exception** to the "every API route authenticates" invariant. Option (b) — no new route — is preferred precisely to avoid this. If (a) is nonetheless necessary, adding it is defensible but adding it *silently* is not: get explicit sign-off, record why (b) was insufficient, and record the exception in CLAUDE.md the same way the `/api/inngest` exception is recorded.
- A development and a production Supabase project turn out to be the same project. Stop — that is a data-safety problem, not a configuration preference, and it invalidates every "test against a test account" instruction in this plan.
- The production environment cannot be made to differ from development in its Anthropic/Tavily keys. Shared keys mean development traffic and production traffic are indistinguishable in spend, which defeats Task 03.

# Completion Criteria

The state is `PRODUCTION READY` when **all** of the following hold:

- Every item in the **Production evidence** table has a recorded artifact, not an assertion.
- Items 4, 5, and 6 are recorded as three separate results. A single "Inngest is configured" line does not satisfy them — item 4 tests the signing key, item 6 tests the event key, and item 5 is what makes item 4 meaningful.
- The canonical origin is decided, documented in the repository, and the explicit statement that preview deployments are not OAuth-capable is written down. Task 14 depends on this.
- **`docs/RUNBOOK.md` exists in the repository** with both sections complete: rollback/recovery (including what cannot be rolled back) and the minimal support/incident path (report route, destination, operator response, containment switches, incident information captured). Task 17's Gates 13 and 15 verify this document; they do not author it.
- The health-check approach is decided and recorded. If option (a) was taken, the CLAUDE.md exception is recorded with its justification and the sign-off is on file.
- All ten migrations are confirmed applied in production, with the `workflow-files` bucket present, private, and RLS-enforced.
- `INTEGRATION_TOKEN_KEY` backed up in two places and restore-tested, with the test recorded.
- All three verification commands green; `git diff` reviewed; no secret in the diff.
- Every manual action recorded in `RELEASE_PROGRESS.md` under Manual Actions with a date and who performed it — **never as agent-completed work**.

Explicitly **not** required for this task, and explicitly not implied by it: that any workflow actually runs correctly in production. That is Task 15, and `PRODUCTION READY` does not assert it.

# Manual / External Steps

Operator-only. The agent documents; it does not perform. Record each with a date in `RELEASE_PROGRESS.md`.

### Host

1. Create the production project on the chosen host. Keep it separate from any preview/development project.
2. Set the Node version to **22.x** to match `package.json` `engines`.
3. Set the build command and confirm it type-checks (or add Task 12's `typecheck` script to the pipeline).
4. Attach the canonical production domain and confirm HTTPS with a valid certificate.
5. Configure the redirect from the non-canonical origin (apex↔`www`) to the canonical one.
6. Set every production environment variable from the Task 13 inventory. **Confirm `INNGEST_DEV` is not among them.**
7. Confirm the host will not silently regenerate or rotate environment variables (B9's failure mode).
8. Set the function timeout appropriate to the execute route, consistent with Task 04's `maxDuration`.

### Supabase production project

9. Confirm the production project is distinct from development, and confirm which project the CLI link in this working copy points at.
10. Apply all ten migrations, in filename order, using your normal migration process.
11. Run the migration-parity procedure and confirm zero drift.
12. Confirm the `workflow-files` bucket exists and is **private**.
13. Confirm RLS is enabled with per-user policies on all nine tables — check each, do not sample.
14. Set Site URL and the Redirect URL allow-list to the canonical origin (`/auth/callback`).
15. Complete the remaining B5 checklist from Task 11: Pro plan (prevents inactivity pausing, which would stop scheduled runs), MFA on the account, SSL enforcement, network restrictions, CAPTCHA on auth (also Task 08), backup retention confirmed, PITR if the database will exceed 4 GB.

### Inngest Cloud

16. Create the production environment and generate the **signing key** and **event key**.
17. Set both in the production host environment.
18. Sync the app and confirm `checkDueSchedules` and `runScheduledWorkflow` are registered.
19. **POST unsigned to the production `/api/inngest` URL and confirm rejection.** Do not skip, do not infer, and do not test locally — the local dev server runs unsigned by design, so a local test proves the opposite of what you need.
20. Separately confirm event publishing via "Run now" on a schedule.

### Providers

21. Create **production-specific** Anthropic and Tavily API keys, distinct from development.
22. Confirm the budget caps from Task 03 Phase 0 apply to the production keys, not only the development ones.
23. Confirm `INTEGRATION_TOKEN_KEY` is stored in a password manager **and** the host's secret store, and **restore it once from backup** to prove the path works. Write down what you did.

### Google

24. **Nothing here.** Google Cloud production configuration, redirect URIs, consent screen, and verification are **Task 14**. Do not start them here — Task 14 depends on the canonical origin this task decides.

# Implementation record — 2026-09-17

Repository-side work done; **not `PRODUCTION READY`** — no production environment exists yet.

### Current State corrections (the repository moved on since this file was written)

- `.github/` **exists** (Task 12 CI + Dependabot) and a `typecheck` script exists. Still no host config file — deliberately (see below).
- `supabase/migrations/` has **16** files, not ten, and there are **twelve** public tables, not nine.
- `/api/inngest` registers **three** functions: `check-due-schedules`, `run-scheduled-workflow`, `cleanup-expired-data`.
- The execute route **does** declare `maxDuration = 300` (Task 04). Not a blocker.

### Discovered state (read-only)

- **Vercel:** MCP authenticated, but the account lists **zero teams and zero projects** (`list_teams`, `get_git_deployment_context` both empty; `list_projects` fails). No Vercel CLI, no `.vercel/`. **No production deployment exists.** Consequence: pushing `main` does not currently deploy anything.
- **Supabase `axelqoxblpchscksfwbx`:** schema reflects all 16 migrations; 12/12 tables RLS-on; `workflow-files` private; 3 storage policies; anon cannot execute `redeem_invite_code` or `consume_action_quota`. **Ledger drift:** `schema_migrations` records only 6 versions (through `202607180001`) — the ten later ones were applied outside the CLI, so `supabase db push` would try to re-apply them. Advisors classified in `docs/DEPLOYMENT.md` §3; none blocking.
- **Stop Condition hit — dev and prod are the same project.** `.env.local`, the CLI link and the MCP all point at `axelqoxblpchscksfwbx`, and `.env.local` carries `INNGEST_DEV=1`. Recorded as an operator decision in `docs/DEPLOYMENT.md` §1 (option A recommended: keep it as production, move dev elsewhere).
- **Resolved 2026-09-17 — option A.** Dev is the separate project `ureajvxesvmehlxlrboy` (WfloAI Dev, us-west-1), built from the 16 repository migrations with a ledger that matches Git, certified (RLS, grants, triggers, storage, behavioural checks under `authenticated`/`anon`). `.env.local` and the CLI link point at Dev; `supabase/.temp/` is untracked and gitignored. Production was not written to. Still open for this task: **`PROD_MIGRATION_HISTORY_RECONCILIATION_REQUIRED`** — procedure in `docs/DEPLOYMENT.md` §3, not executed.

### Required Changes — status

- [x] Env inventory regenerated. Defect found and fixed: `RETENTION_CLEANUP_ENABLED` read by code but undeclared. `tests/env.test.ts` now fails on any read-but-undeclared variable. `ERROR_REPORTER_DSN` is declared (commented) and unread by design until Task 02 picks a vendor.
- [x] Startup check lists both Inngest keys (unchanged, already correct). **Added:** production refuses to boot when `INNGEST_DEV` would put the SDK in dev mode (SDK 4.11.0: `"1"`/`"true"` or a URL). Verified behaviourally with `next start` and placeholder values: `INNGEST_DEV=1` → exit 1 with the refusal; `INNGEST_DEV=0` → boots.
- [x] `maxDuration` present on the execute route.
- [x] Canonical-origin decision written (`docs/DEPLOYMENT.md` §1): one custom-domain origin, sibling 308s to it, `*.vercel.app` and previews **not** OAuth-capable. **The hostname itself is operator input** — not chosen.
- [x] Host configuration: **no `vercel.json`** — every behaviour it would set is already declared in the repo (engines, route `maxDuration`, `next.config.mjs`). Recorded with reasons.
- [x] Migration-parity procedure written, including the schema fingerprint needed because the ledger is wrong.
- [x] Health check: **option (b)**, no new route. Liveness = unauthenticated `GET /api/credentials` → 401, which proves a function booted past the startup check. No CLAUDE.md exception added.
- [x] `docs/RUNBOOK.md` written — rollback/recovery (incl. what cannot be rolled back) and support/incident (report route, destination, response, containment switches, incident capture). Support address and operator name are **operator input**.

### Production evidence table

**0 of 18 items recorded** — every one needs a deployed environment. The expanded, command-level checklist is `docs/DEPLOYMENT.md` §5.

# Release resume — 2026-09-17

Status: **IN PROGRESS, not `PRODUCTION READY`.** Two operator checkpoints stand in the way (below); nothing was deployed and production was not written to.

### Operator decisions recorded

- Canonical origin: the **Vercel-generated production alias** for V1; no custom domain. A custom domain may later be required by Google verification only (`GOOGLE_CUSTOM_DOMAIN_MAY_BE_REQUIRED`, Task 14). `docs/DEPLOYMENT.md` §1 rewritten accordingly; evidence row 2 (sibling redirect) is N/A for V1.
- Support address: `vishwath@ucsb.edu` — shipped in `d78e84d` (privacy, terms, `/help#contact`, RUNBOOK §2.1).
- Production DB stays `axelqoxblpchscksfwbx`; Dev stays `ureajvxesvmehlxlrboy`.

### Dev/Prod separation — re-verified

`.mcp.json`: `supabase` → `axelqoxblpchscksfwbx` `read_only=true`; `supabase-dev` → `ureajvxesvmehlxlrboy` writable; no account-level Supabase MCP. `.env.local` URL and `supabase/.temp/project-ref` → Dev only. No project ref hardcoded in tracked source.

### Production migration ledger — `PRODUCTION MIGRATION REPAIR OPERATOR CHECKPOINT`

Pre-repair verification is complete and passed (catalog fingerprint vs Dev, detail in `docs/DEPLOYMENT.md` §3): the ten missing versions are exactly `202607190001–4`, `202609150001–3`, `202609160001–2`, `202609170001`, and every one's effect is present. The repair was **not** run: the Supabase CLI here is unauthenticated. Ledger still records 6/16.

### Vercel — `VERCEL PROJECT CREATION CHECKPOINT`

Re-discovered: zero teams, zero projects, no `.vercel/`, no CLI. Intended project settings and the auto-deploy consequence are in `docs/DEPLOYMENT.md` §6. Env matrix re-derived from code with no drift; every variable ABSENT in Vercel (no project).

### Production evidence table

Still **0 of 18** recorded.

### Update 2026-09-18 — production ledger reconciled

`PRODUCTION MIGRATION REPAIR OPERATOR CHECKPOINT` cleared. With operator authorisation, `supabase migration repair --status applied` recorded exactly the ten verified versions on `axelqoxblpchscksfwbx` from an isolated scratch workdir (this checkout stayed linked to Dev). After: `migration list` 16/16 local = remote; `db push --dry-run` "Remote database is up to date" (no real push); catalog fingerprint identical before and after; scratch link removed. Detail in `docs/DEPLOYMENT.md` §3. This is evidence of ledger parity only — the 18 production evidence items still need a deployment.

`VERCEL PROJECT CREATION CHECKPOINT`: operator approved creating `wfloai`, but the Vercel MCP still reports **zero teams**, and `create_git_project` requires a team scope. The project was not created; no team ID was guessed.

### Update 2026-09-18 — Vercel project created (no deployment)

`VERCEL PROJECT CREATION CHECKPOINT` cleared: `wfloai` (`prj_W9RynoK7SBt33Eg8v5zv2lYv9Q3Y`) in `vishwaths-projects` (hobby), Git-linked to `VishwathS/WfloAI`, production branch `main`, **0 deployments**, no domain yet. Created with `deploy: false`. Two deviations found and left for the operator: project Node setting `24.x` (engines pin `>=22 <23` governs the build), and Vercel Authentication `all_except_custom_domains`, which is expected to wall off the production `*.vercel.app` alias. Detail in `docs/DEPLOYMENT.md` §6. Now at the **production environment-variable / first-deployment checkpoint**; any push to `main` deploys to production. Evidence still 0/18.
