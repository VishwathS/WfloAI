# WfloAI — Production deployment (Task 13)

This is the repository record of how production is built, what it needs, and how
to prove it is wired correctly. It is written for the operator; nothing in it has
been performed by an agent. Evidence of each step belongs in
`RELEASE_PROGRESS.md` under the manual-action log, with a date and a name.

Operations — rollback, recovery, support and containment — are in
[RUNBOOK.md](RUNBOOK.md).

---

## 1. Decisions recorded here

### Host: Vercel, with no `vercel.json`

Next.js is auto-detected. Everything production depends on is already declared
in the repository, so a `vercel.json` would only restate it:

| Behaviour | Where it is declared |
|---|---|
| Node 22.x | `package.json` `engines.node` (`>=22 <23`). Vercel honours this over the project setting |
| Execute route may run 300s | `export const maxDuration = 300` in `app/api/workflows/[id]/execute/route.ts` |
| Inngest route may run 300s | `export const maxDuration = 300` in `app/api/inngest/route.ts` |
| File extraction may run 60s | `export const maxDuration = 60` in `app/api/workflows/[id]/files/route.ts` |
| `mammoth` not bundled | `serverExternalPackages` in `next.config.mjs` |
| Security headers | `headers()` in `next.config.mjs` |
| Scheduled work | Inngest Cloud — **no Vercel Cron** is used |

The one host setting that can contradict the repository is the **plan's function
duration ceiling**. A route cannot run longer than the plan allows, whatever it
exports. Confirm the project's plan permits 300s before deploying (Task 04's
outstanding operator item), and note that Vercel's Hobby plan is for
non-commercial use.

### Canonical origin

**Decided 2026-09-17 (operator): V1 uses the Vercel-generated production
domain.** No custom domain is configured, none is being bought, and the lack of
one does not block the first deployment.

```
https://<CANONICAL_HOST>      # the project's production alias, <name>.vercel.app
```

`<CANONICAL_HOST>` is the production alias Vercel assigns when the project is
created. For a project named `wfloai` it is normally `wfloai.vercel.app`, but
Vercel picks a different name when that one is taken, so **the exact hostname is
recorded only after creation, from the project's Domains page.** Until then it
stays a placeholder here, in RUNBOOK.md and in GOOGLE-OAUTH.md.

Rules that follow:

1. **The production alias is the one canonical origin.** Every OAuth redirect is
   registered against it and nothing else.
2. **Deployment-specific URLs are not canonical and not OAuth-capable.** Every
   deployment also gets its own hashed `*.vercel.app` URL. Signing in or
   connecting Gmail there fails by design, because neither Supabase Auth nor
   Google has that origin registered.
3. **Preview deployments are not OAuth-capable** for the same reason. A preview
   pass proves nothing about production OAuth.
4. **A custom domain may become mandatory later, for Google only.** Google's
   sensitive-scope verification needs an authorized domain the operator can
   verify in Search Console, with the homepage and privacy policy on it. Whether
   a `*.vercel.app` host satisfies that is settled when Task 14 submits —
   recorded there as `GOOGLE_CUSTOM_DOMAIN_MAY_BE_REQUIRED`, an operator gate,
   not a deployment blocker. If a domain is added then, it becomes canonical,
   the `vercel.app` alias redirects to it (308), and every URL below is
   re-registered.

Why this matters in code: there is no site-URL variable. Every redirect is built
from the incoming request's origin — `app/auth/callback/route.ts`,
`components/auth/login-card.tsx`, `app/api/integrations/gmail/connect/route.ts`
and `.../callback/route.ts`. The origin a user arrives on *is* the origin OAuth
uses.

URLs registered from this decision (Task 14 consumes these):

| Where | Value |
|---|---|
| Supabase Auth (production project) → Site URL | `https://<CANONICAL_HOST>` |
| Supabase Auth → Redirect URLs | `https://<CANONICAL_HOST>/auth/callback**` (the login card appends `?next=…`) |
| Google Cloud → Gmail OAuth client → Authorized redirect URI | `https://<CANONICAL_HOST>/api/integrations/gmail/callback` |
| Google Cloud → OAuth consent screen → homepage / privacy / terms | `https://<CANONICAL_HOST>/`, `/privacy`, `/terms` |

### Health check: no new route (option b)

There is **no `/api/health`**, and none should be added. CLAUDE.md's rule that
every `app/api/` route authenticates has exactly one exception (`/api/inngest`),
and a health endpoint is not a reason for a second.

Liveness is proven with an existing authenticated route called **without** a
session:

```
curl -s -o /dev/null -w "%{http_code}\n" https://<CANONICAL_HOST>/api/credentials
# expected: 401
```

A 401 means a Node function booted, which means `instrumentation.ts` ran the
startup check and it passed — a missing required variable, or `INNGEST_DEV`,
makes the process exit and the probe returns 5xx instead. It spends nothing and
touches no data. Deeper checks (a real run) need a real session and belong to
Task 17's smoke test.

### Supabase: which project is production

**Decided 2026-09-17 — Option A.** Development and production are separate
hosted projects in the same organization:

| Project | Ref | Region | Used by |
|---|---|---|---|
| WfloAI (production) | `axelqoxblpchscksfwbx` | us-west-2 | Vercel **Production** env only (Task 13). Real users, the live invite |
| WfloAI Dev | `ureajvxesvmehlxlrboy` | us-west-1 | `.env.local`, the local CLI link, the writable dev MCP. Disposable test data |

The previous state — `.env.local`, the CLI link and the MCP all on
`axelqoxblpchscksfwbx` — meant local runs with `INNGEST_DEV=1` spent and wrote
against the database real users are in. The CLI link state (`supabase/.temp/`)
was also **committed**, so every clone started linked to production. It is now
gitignored and per-machine.

How Dev was built (repeatable for a fresh dev project):

1. Create an empty project; apply the 16 files in `supabase/migrations/` in
   filename order. Dev was built through the Supabase MCP `apply_migration`,
   which records each migration under a generated timestamp, so the 16 ledger
   rows were then realigned to the Git versions; `supabase db push` from a
   working copy linked to Dev therefore has nothing to apply. Each ledger row's
   stored statement was checked byte-for-byte (md5) against its file.
2. No data is copied from production. Dev holds no invite codes; create a
   dev-only one when a test needs it.
3. Point `.env.local` at Dev (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), and
   `supabase link --project-ref <dev ref>`.
4. Rebuild: `next build` inlines `NEXT_PUBLIC_*`, so a stale `.next/` keeps the
   old project URL until rebuilt.

**Dev Auth.** Email auth is on; Google login is off until a Google OAuth client
for Supabase login is configured for Dev (Dashboard → Authentication →
Providers → Google). That client's authorized redirect URI is
`https://ureajvxesvmehlxlrboy.supabase.co/auth/v1/callback`. In Dev's
Authentication → URL Configuration set Site URL `http://localhost:3000` and add
`http://localhost:3000/auth/callback**` (the login card sends
`${origin}/auth/callback?next=…`). This is the Supabase **login** client — not
the Gmail integration client, which redirects to the app itself.

Never point `.env.local` or the CLI at `axelqoxblpchscksfwbx`. Any operator
action against production goes through the dashboard or a deliberately scoped
session, not this working copy.

---

## 2. Environment variables

Re-derived 2026-09-17 (release resume) from every `process.env.*` read in `app/
lib/ components/ hooks/ proxy.ts instrumentation.ts next.config.mjs`, plus the
SDK-implicit Inngest variables, reconciled against `.env.local.example` and
`lib/config/env.ts`: **no drift**. `tests/env.test.ts` fails if code reads a
variable the example does not declare. The Anthropic model id is a code
constant (`claude-haiku-4-5-20251001`), not configuration.

Set in Vercel → Project → Settings → Environment Variables, scope
**Production** only. Do not give Preview the production values: previews are not
OAuth-capable anyway, and a preview holding the production service-role key is a
second production.

**Current Vercel status (2026-09-18): project `wfloai` exists; every row ABSENT.**
The agent does not set these — the operator does, in the dashboard (the Vercel
MCP has no environment-variable tool, and values never pass through the agent).

| Variable | Required | Exposure | Value comes from | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public (by design) | Supabase → **WfloAI** `axelqoxblpchscksfwbx` → Project Settings → API → Project URL | Must be `https://axelqoxblpchscksfwbx.supabase.co`, **never** Dev `ureajvxesvmehlxlrboy`. Inlined at build time — set before the first production build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public (by design) | Same page → anon / publishable key of `axelqoxblpchscksfwbx` | Inlined at build time |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only, secret** | Same page → service_role key of `axelqoxblpchscksfwbx` | Never `NEXT_PUBLIC_`. Never copied from `.env.local`, which holds the **Dev** key |
| `ANTHROPIC_API_KEY` | Yes | Server only, secret | Anthropic Console → a **production-only** key | Distinct from dev; spend cap on it (Task 03) |
| `TAVILY_API_KEY` | Yes | Server only, secret | Tavily dashboard → a **production-only** key | Distinct from dev; cap on it |
| `INTEGRATION_TOKEN_KEY` | Yes | Server only, secret | Generate once on your own machine: `openssl rand -base64 32` | 32 bytes, base64. Back up in two places **before** first use — [KEY-RECOVERY.md](KEY-RECOVERY.md). Not the dev value |
| `GOOGLE_CLIENT_ID` | Yes | Server only | Google Cloud → the **Gmail integration** OAuth client (Task 14) | Should not be the Supabase login client — GOOGLE-OAUTH.md §0 records evidence they are currently the same |
| `GOOGLE_CLIENT_SECRET` | Yes | Server only, secret | Same client | |
| `INNGEST_SIGNING_KEY` | Yes | Server only, secret | Inngest Cloud → production environment → Signing key | Security control (MASTER §4.1) |
| `INNGEST_EVENT_KEY` | Yes | Server only, secret | Inngest Cloud → production environment → Event key | Functional; schedules and Run now fail without it |
| `GMAIL_READ_ACTIONS_ENABLED` | No — set it anyway | Server only | Literal `false` | Makes the V1 position visible in the env listing |
| `RETENTION_CLEANUP_ENABLED` | No | Server only | `true` only when you intend the retention sweep to delete (Task 12) | Absent or anything else = deletes nothing |
| Error reporter DSN | No (Task 02) | Server only, secret | Only after a vendor is chosen **and** listed in the privacy policy | Unread by code today |
| `INNGEST_DEV` | **Must be absent** | — | Never | The app refuses to boot with it (`lib/config/env.ts`, tested) |

`NODE_ENV`, `NEXT_PHASE` and `NEXT_RUNTIME` are platform-provided; do not set them.

The startup check (`lib/config/env.ts`) refuses to boot in production if any of
the ten required variables is missing or blank, or if `INNGEST_DEV` would put the
Inngest SDK in dev mode.

---

## 3. Migration parity procedure

`supabase/migrations/` holds **16** files. (Task 13's text says ten; six were
added by Tasks 01, 03, 05, 08, the cross-task remediation and the invite track.)

### The ledger in `axelqoxblpchscksfwbx` does not match its schema

Read-only inspection on 2026-09-17:

- `supabase_migrations.schema_migrations` records **6** versions, `202605140001`
  through `202607180001`.
- The **schema** shows all 16 applied: `gmail_connections`, `user_credentials`,
  `integration_action_executions` (with `input_units` / `output_units`),
  `integration_audit_events`, `profiles`, `invite_codes`,
  `invite_redemption_attempts`, `workflow_schedules.consecutive_failures /
  disabled_reason / unattended_send_authorized_at`, and the functions
  `consume_action_quota`, `handle_new_user` and `redeem_invite_code`.

The ten later migrations were applied outside the CLI (SQL editor), so the
ledger never recorded them. **Consequence: `supabase db push` against this
project would try to re-apply ten migrations that are already live.** Do not
run it.

### `PROD_MIGRATION_HISTORY_RECONCILIATION_REQUIRED` (Task 13) — RESOLVED 2026-09-18

**2026-09-18: repair run and verified — ledger 16/16.** Operator authenticated
the Supabase CLI (2.117.0) and authorised this one operation. From the isolated
scratch workdir (identical copy of the 16 migrations, no `config.toml`), the
repository checkout's link stayed on Dev (`ureajvxesvmehlxlrboy`) throughout:

- `link --project-ref axelqoxblpchscksfwbx` (scratch only); `migration list`
  showed exactly the six shared versions and the ten local-only ones.
- `migration repair --linked --status applied` for exactly the ten versions
  below → CLI: "Migration history repaired".
- `migration list` after: 16 rows, local = remote for every one.
- `db push --dry-run`: `"upToDate": true`, `migrations: []` — "Remote database
  is up to date". No real push was run; no migration SQL was applied; the
  ledger table was not hand-edited.
- Read-only MCP catalog fingerprint (public columns, constraints, indexes,
  public+storage policies, public function bodies) taken immediately before and
  after the repair: **identical** (`cols 6fca00fe…`, `cons 28bd947a…`,
  `idx c268a638…`, `pol 3cd52e03…`, `fn 872a350a…`); ledger rows 6 → 16.
- Scratch workdir unlinked afterwards.


**2026-09-17 (release resume): pre-repair verification done; repair not yet run.**

- Production ledger (read-only MCP): exactly `202605140001`, `202605150001`,
  `202606220001`, `202607030001`, `202607050001`, `202607180001`. The ten Git
  versions missing from it are exactly the ten in step 3 below.
- Every effect of those ten was checked read-only by fingerprinting
  production's catalog against **WfloAI Dev**, which was built from the same 16
  files: columns (type, nullability, default), constraints, indexes, public and
  storage policies (roles, `using`, `with check`), triggers (including
  `on_auth_user_created` on `auth.users`), RLS flags, table ACLs, column
  comments, the `workflow-files` bucket, and every public function's signature,
  defaults, return type, language, `security definer`, `search_path` and ACL —
  **all identical**. Function bodies: `handle_new_user` and
  `redeem_invite_code` differ only in whitespace/CR; `consume_action_quota`
  differs only because production's copy was pasted with its comments stripped —
  with comments and whitespace removed it hashes identically to the migration
  file (`137c28ca…`). No effect is absent or materially different.
- Supabase docs re-read (CLI reference `supabase-migration-repair`, Database
  Migrations guide): `--status applied` "will insert a new record", and repair
  "updates the tracking table only — it does not apply or revert any SQL".
  Still the supported mechanism.
- **Blocked on:** the Supabase CLI on this machine is not authenticated
  (`LegacyPlatformAuthRequiredError`). An isolated scratch workdir holding an
  identical copy of `supabase/migrations/` is staged outside the repository so
  this checkout's CLI link stays on Dev. After `supabase login`, the agent runs
  steps 2–4 below with `--workdir <scratch>`.

The supported fix is the CLI's `supabase migration repair`. Per the Supabase
docs it "updates the tracking table only — it does not apply or revert any
SQL", and `--status applied` inserts the ledger row. Do not hand-edit
`supabase_migrations.schema_migrations` on production.

Operator-only, in a deliberate session — this working copy is linked to Dev
and must stay that way:

1. Re-run the read-only schema check below against production and confirm all
   16 migrations' objects are present. Repair records what the schema already
   is; if anything is missing, stop — repairing would hide it.
2. In a scratch checkout (not this one), `supabase link --project-ref
   axelqoxblpchscksfwbx`, then `supabase migration list` — expect the six
   `202605140001`…`202607180001` on both sides and the other ten local-only.
3. Mark the ten as applied:

   ```bash
   supabase migration repair --status applied \
     202607190001 202607190002 202607190003 202607190004 \
     202609150001 202609150002 202609150003 \
     202609160001 202609160002 202609170001
   ```

4. `supabase migration list` shows all 16 on both sides, and
   `supabase db push --dry-run` reports nothing to push.
5. Unlink or delete the scratch checkout.

Nothing in the Dev provisioning changed production's ledger; before the 2026-09-18 repair it recorded 6, and it now records all 16.

### Procedure (operator runs it; read-only)

1. What the ledger says — Supabase SQL editor of the target project:

   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   ```

2. What the repository expects:

   ```bash
   ls supabase/migrations
   ```

3. Because the ledger can be wrong, check the schema itself:

   ```sql
   select
     (select json_agg(json_build_object('t', c.relname, 'rls', c.relrowsecurity,
        'policies', (select count(*) from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname))
        order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r') as tables,
     (select json_agg(proname order by proname)
      from pg_proc where pronamespace = 'public'::regnamespace) as functions,
     (select json_agg(json_build_object('id', id, 'public', public))
      from storage.buckets) as buckets,
     (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects') as storage_policies,
     has_function_privilege('anon', 'public.redeem_invite_code(text)', 'EXECUTE') as anon_can_redeem;
   ```

   Expected for a fully migrated project (observed on `axelqoxblpchscksfwbx`,
   2026-09-17):

   | Table | RLS | Policies |
   |---|---|---|
   | `execution_logs` | on | 4 |
   | `gmail_connections` | on | 4 |
   | `integration_action_executions` | on | 3 |
   | `integration_audit_events` | on | 2 |
   | `invite_codes` | on | **0 — intentional** (no client may read codes) |
   | `invite_redemption_attempts` | on | 1 |
   | `profiles` | on | 1 (select-own; **no UPDATE — intentional**) |
   | `user_credentials` | on | 4 |
   | `workflow_files` | on | 3 |
   | `workflow_runs` | on | 3 |
   | `workflow_schedules` | on | 4 |
   | `workflows` | on | 4 |

   Functions: `consume_action_quota`, `handle_new_user`, `redeem_invite_code`,
   `set_updated_at`. Buckets: `workflow-files` with `public = false`. Storage
   policies: 3. `anon_can_redeem`: `false`.

4. Zero drift means every repository migration's objects are present, every
   table has RLS on, the bucket is private, and anon cannot redeem.

### Supabase advisors (2026-09-17, read-only) — classified, none blocking

| Finding | Classification |
|---|---|
| `invite_codes` RLS with no policy | Intentional — codes are never client-readable |
| `redeem_invite_code` executable by `authenticated` | Intentional — the redemption path; anon is revoked; attempts are rate-limited inside the function |
| `handle_new_user` executable by `anon`/`authenticated` | Not exploitable — it returns `trigger`, and Postgres refuses to call trigger functions outside a trigger. Hygiene item; a revoke can ride a future migration |
| `set_updated_at`, `consume_action_quota` mutable `search_path` | Both are `SECURITY INVOKER`, so a caller gains nothing. Hygiene item |
| Leaked-password protection off | N/A — Google OAuth is the only sign-in method |
| 33× `auth_rls_initplan`, unused indexes, one unindexed FK | Performance at scale; irrelevant at invite-beta volume. Revisit after launch |

---

## 4. Deployment runbook (operator)

Every step is a production action and is the operator's. Record each with a date
in `RELEASE_PROGRESS.md`.

1. **Resolve the Supabase decision** (§1). Nothing below is meaningful until it is.
2. **Canonical host** — decided: the Vercel production alias (§1). Record the
   exact hostname once the project exists.
3. **Create the Vercel project** — see §6, `VERCEL PROJECT CREATION CHECKPOINT`.
   - **Decide auto-deploy before pushing again.** With the Git integration on,
     every push to `main` is a production deployment. If deploys should be
     deliberate, disable Git deployments for `main` (`git.deploymentEnabled`,
     in project settings or a reviewed `vercel.json`) and promote by hand.
4. **Confirm the plan's function duration ceiling is ≥ 300s.**
5. **Set every production variable** from §2. Confirm `INNGEST_DEV` is absent.
6. **Inngest Cloud:** create or choose the production environment and copy its
   signing key and event key into Vercel (step 5).
7. **Deploy** the commit to be certified. Record the deployment id and SHA.
8. **Attach `<CANONICAL_HOST>`** and the non-canonical sibling, with the sibling
   redirecting (308) to the canonical host. Wait for the certificate.
9. **Supabase Auth** (production project): Site URL and Redirect URLs per §1.
   Keep the Google provider enabled.
10. **Inngest Cloud → Apps → Sync** `https://<CANONICAL_HOST>/api/inngest`.
    Confirm **three** functions register: `check-due-schedules`,
    `run-scheduled-workflow` and `cleanup-expired-data`.
11. Run the evidence checks in §5.

---

## 5. Post-deploy evidence checklist

Each row needs a recorded artifact; "configured" is not evidence. Rows marked
**agent-verifiable** can be run read-only by an agent once the URL exists.

| # | Check | How | Expected | Who |
|---|---|---|---|---|
| 1 | HTTPS on canonical origin | `curl -sI https://<CANONICAL_HOST>/` | `200`, served over TLS | agent-verifiable |
| 2 | Non-canonical redirects | `curl -sI` on the sibling host | `308` → `https://<CANONICAL_HOST>/` | **N/A for V1** — no custom domain, so no sibling host (§1). Revisit if a domain is added |
| 3 | Security headers | `curl -sI https://<CANONICAL_HOST>/` | `strict-transport-security`, `x-content-type-options: nosniff`, `referrer-policy`, `x-frame-options: DENY`, `content-security-policy: frame-ancestors 'none'`, `permissions-policy` | agent-verifiable |
| 4 | **Unsigned POST to `/api/inngest` rejected** (signing key) | `curl -si -X POST https://<CANONICAL_HOST>/api/inngest -H 'content-type: application/json' -d '{}'` | 4xx rejection, no function run | agent-verifiable |
| 5 | `INNGEST_DEV` absent | Vercel env listing (names only) | not present | operator; row 19 corroborates, since the app will not boot with it |
| 6 | Event publishing works (event key) | Schedule "Run now" | a `workflow_runs` row with `trigger = 'scheduled'` | operator; agent verifies the row read-only |
| 7 | Functions registered | Inngest Cloud → Apps | the three functions in §4 step 10 | operator |
| 8 | Migration parity | §3 | zero drift | agent-verifiable (read-only MCP) |
| 9 | `workflow-files` private | §3 query | `public = false` | agent-verifiable |
| 10 | Storage RLS cross-user denial | signed-in user A requests an object under user B's prefix | denied | operator (needs two sessions) |
| 11 | RLS on every table | §3 query | 12/12 `rls = on` | agent-verifiable |
| 12 | Auth Site URL / Redirect URLs | Supabase dashboard | canonical origin | operator |
| 13 | Prod provider keys distinct, caps set | Anthropic / Tavily consoles | distinct keys; spend caps on the prod keys | operator |
| 14 | `INTEGRATION_TOKEN_KEY` in two places, restore-tested | KEY-RECOVERY.md procedure | written record of the restore | operator |
| 15 | `GMAIL_READ_ACTIONS_ENABLED=false` | Vercel env listing | `false` | operator |
| 16 | Backups and retention | Supabase dashboard → Database → Backups | enabled, period known | operator |
| 17 | Error reporting receives a prod error | Task 02 reporter | event visible — **blocked until a vendor is chosen** | operator |
| 18 | Node 22.x | Vercel build log | `Node.js 22.x` | agent-verifiable (build logs) |
| 19 | Startup check passed (liveness) | `curl -s -o /dev/null -w '%{http_code}' https://<CANONICAL_HOST>/api/credentials` | `401` | agent-verifiable |
| 20 | Auth gate | `curl -sI https://<CANONICAL_HOST>/dashboard` and `/settings` | `307` → `/login` | agent-verifiable |
| 21 | Deployed SHA | Vercel deployment metadata | equals the commit being certified | agent-verifiable |

---

## 6. `VERCEL PROJECT CREATION CHECKPOINT` (2026-09-17)

State found (Vercel MCP, read-only): authenticated, **zero teams, zero
projects**, no Git-linked project; no `.vercel/` in this checkout; no Vercel CLI
installed. Nothing has been created.

Creating the project is a production-infrastructure action and is the
operator's. The intended project:

| Setting | Value |
|---|---|
| Project name | `wfloai` (Vercel lowercases names; product name WfloAI) |
| Repository | `VishwathS/WfloAI` (GitHub) |
| Framework preset | Next.js (auto-detected) |
| Root directory | `/` |
| Install / build command | defaults — `npm install`, `npm run build` (`next build`) |
| Node.js | 22.x — `package.json` `engines` `>=22 <23`; confirm the project setting agrees |
| Production branch | `main` |
| Function duration | execute and Inngest routes export `maxDuration = 300`; the plan's ceiling must allow it (Task 04 operator item). Hobby is for non-commercial use |
| Domain | the generated `*.vercel.app` production alias; no custom domain (§1) |
| Environment variables | §2, **Production** scope only, set **before** the first production build |

**Auto-deploy behaviour.** With the GitHub integration connected, every push to
the production branch `main` creates a **production** deployment and other
branches create previews, unless Git deployments are disabled
(`git.deploymentEnabled`). Therefore:

- A production build that runs before §2's variables exist inlines empty
  `NEXT_PUBLIC_SUPABASE_*` values, and the startup check refuses to boot. Set the
  variables first, or let that first build fail harmlessly and redeploy after.
- **Once connected, a push to `main` is a production action.** The agent does
  not push to `main` after that without explicit approval.
- The first deployment builds whatever `origin/main` points at when the
  repository is connected; local `main` may be ahead of it.

### Update 2026-09-18 — project created, not deployed

Created by the agent with operator approval, via Vercel MCP `create_git_project`
with `deploy: false`; verified read-only afterwards:

| Check | Result |
|---|---|
| Workspace | `vishwaths-projects` (`team_Md4RjbTLzhf6pfoNQgP8zvWy`), plan **hobby** |
| Project | `wfloai`, `prj_W9RynoK7SBt33Eg8v5zv2lYv9Q3Y` |
| Git link | GitHub `VishwathS/WfloAI` |
| Production branch | `main` |
| Deployments | **0** (`latestDeployment: null`, `live: false`) |
| Domains | **none yet** — the `*.vercel.app` production alias is assigned by the first production deployment; `<CANONICAL_HOST>` is recorded then |
| Project Node setting | **`24.x`** (Vercel default) — does **not** match §6. `package.json` `engines.node` `>=22 <23` takes precedence at build, and evidence row 18 checks the build log; set the project to 22.x anyway (operator, dashboard) so the two agree |
| Framework preset | not exposed by the MCP; Vercel auto-detects Next.js at build — confirm in the first build log |
| Deployment protection | Vercel Authentication **on**, `all_except_custom_domains`; password and trusted-IP off. See below |

**Deployment protection is a first-deployment blocker to check.** With
`all_except_custom_domains`, only custom domains are exempt, and V1 has none —
so the generated production `*.vercel.app` alias is expected to sit behind a
Vercel login wall. That would block visitors, Google's redirect back to
`/api/integrations/gmail/callback`, and Inngest Cloud's calls to `/api/inngest`.
Operator decision (not changed by the agent, since it relaxes a protection):
Settings → Deployment Protection → Vercel Authentication → protect **only
preview deployments**, keeping previews private. Verify after the first deploy
with a logged-out browser.

**From now on a push to `main` deploys to production.** The agent pushes only
with explicit operator approval (PRODUCTION PUSH/DEPLOY APPROVAL REQUIRED).
At creation `origin/main` was `a635e15`.

### Update 2026-09-18 — minimum-change configuration pass

Operator decision: the initial invite-only deployment **reuses the existing
working credentials** (Anthropic, Tavily, the current Google OAuth client).
Separate production credentials and splitting the Supabase-login and Gmail
OAuth clients are deferred hardening, not blockers. The Gmail scope decision is
unchanged: new connections request exactly `openid email gmail.send`.

| Item | State |
|---|---|
| Deployment protection | **Changed by the agent** (operator-authorised) via Vercel MCP: Vercel Authentication `prod_deployment_urls_and_all_previews` — previews and per-deployment URLs stay behind Vercel login; production domains are public. Password and trusted-IP unchanged (off). Verify with a logged-out request after the first deploy |
| Node version | Project setting still `24.x`: the Vercel MCP has no project-settings tool. `engines.node` `>=22 <23` governs the build; operator may set Settings → Build and Deployment → Node.js Version → 22.x so the two agree |
| Environment variables | **Not written**: the Vercel MCP has no environment-variable tool and the Vercel CLI is neither installed nor logged in. All rows still ABSENT |
| `INTEGRATION_TOKEN_KEY` | **Compatibility with the production legacy Gmail credential not established.** The local key is 44 base64 chars (32 bytes); the production row's envelopes are `v1:`. A decrypt-test needs the production ciphertext read into the agent session, which was refused as credential handling. Not generated, not rotated; the production row was not touched |
| Inngest | Only the local dev server is configured (`INNGEST_DEV`); **no** `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` exist locally. Production keys must come from Inngest Cloud (or its Vercel integration) |

### Update 2026-09-18 — Production environment configured (not deployed)

- **`INTEGRATION_TOKEN_KEY` verified.** An operator-run, read-only check piped the
  production legacy Gmail connection's *expired* access-token envelope straight
  into a local decrypt test (`supabase db query --linked --project-ref
  axelqoxblpchscksfwbx` from an unlinked scratch workdir; target confirmed by
  non-secret row counts, Prod ≠ Dev). Output was only `RESULT: MATCH`. The key is
  reused unchanged — not generated, rotated or displayed — and the production row
  was not modified.
- **Vercel CLI** (59.23.1, operator login, scope `vishwaths-projects`) linked this
  checkout to `wfloai` (`.vercel/`, now gitignored). `vercel link` also appended a
  `VERCEL_OIDC_TOKEN` to `.env.local` and `.vercel` + `.env*` to `.gitignore`; the
  token line was removed and the ignore narrowed to `.vercel`.
- **Production env vars written** with `vercel env add NAME production`, values on
  stdin, never printed:

| Variable | Type | Source |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sensitive | reused existing key |
| `TAVILY_API_KEY` | Sensitive | reused existing key |
| `GOOGLE_CLIENT_ID` | Config | reused existing OAuth client |
| `GOOGLE_CLIENT_SECRET` | Sensitive | reused existing OAuth client |
| `INTEGRATION_TOKEN_KEY` | Sensitive | reused, verified MATCH above |
| `GMAIL_READ_ACTIONS_ENABLED` | Config | literal `false` |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | `https://axelqoxblpchscksfwbx.supabase.co` (derived from the ref, **not** copied from `.env.local`, which is Dev) |

- **Still ABSENT (operator):** `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  (production dashboard → Vercel dashboard, Production only), `INNGEST_SIGNING_KEY`,
  `INNGEST_EVENT_KEY` (Inngest Vercel integration). Deliberately absent:
  `INNGEST_DEV`, `RETENTION_CLEANUP_ENABLED`.
- **Audit (names/scope only):** all seven Production-only; a Production pull to a
  scratch file (deleted) had 0 occurrences of the Dev ref, 1 of the production ref,
  `GMAIL_READ_ACTIONS_ENABLED=false`, no `INNGEST_DEV`, no `RETENTION_CLEANUP_ENABLED`.
- **Node:** project set to **22.x** via `vercel api PATCH /v9/projects/…`
  (`nodeVersion` only); verified via Vercel MCP. Deployments still **0**.

### Update 2026-09-18 — pre-deployment re-audit PASSED (names/scopes only)

- **All 11 required Production variables PRESENT**: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive),
  `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `INTEGRATION_TOKEN_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`,
  `GMAIL_READ_ACTIONS_ENABLED`. The two Supabase keys were added by the operator.
- **Supabase target**: URL is `https://axelqoxblpchscksfwbx.supabase.co`; anon key
  is a JWT whose `ref` is `axelqoxblpchscksfwbx`, `role` `anon`. The service-role key
  is Sensitive (not readable) — its target is proven at first boot. 0 occurrences
  of the Dev ref `ureajvxesvmehlxlrboy`.
- `GMAIL_READ_ACTIONS_ENABLED=false`; `INNGEST_DEV` and `RETENTION_CLEANUP_ENABLED` ABSENT.
- **Inngest** Vercel integration installed by the operator. It added
  `INNGEST_SIGNING_KEY` (a production signing key) and `INNGEST_EVENT_KEY` to
  **Production and Preview**, both as readable (non-Sensitive) values. Deferred
  hardening: convert both to Sensitive (rotate), and restrict the integration's
  project selection from **all projects** to `wfloai` only.
- **Node** 22.x; **protection** `prod_deployment_urls_and_all_previews`, password off.
- **Framework preset** unset on the project (`framework: null`); setting it to
  Next.js in the dashboard is recommended before the first deploy, and the first
  build log must show Next.js detected.

### Update 2026-09-18 — first production deployment (operator-approved)

`main` pushed `a635e15..6a331b5` with explicit operator approval; Vercel Git
integration built it. `<CANONICAL_HOST>` = **`wfloai.vercel.app`**.

| Check | Result |
|---|---|
| Deployment | `dpl_5Lv1fmG7jiJ8LSmu1RihzrMY2yg3`, commit `6a331b5`, target production, **READY** in ~50s, region `iad1` |
| Framework | build log "Detected Next.js version: 16.3.5"; deployment records framework `nextjs`; Turbopack build, TypeScript passed, 19 static pages |
| Node | project `22.x`, `engines.node` `>=22 <23`; no engine/version warning in the build log |
| Aliases | `wfloai.vercel.app`, `wfloai-vishwaths-projects.vercel.app`, `wfloai-git-main-vishwaths-projects.vercel.app` (production domains — public) |
| Boot / env check | pages render; no startup-check or missing-variable errors in runtime logs |
| Logged-out public | `/`, `/privacy`, `/terms`, `/help`, `/login` → 200 |
| Logged-out gated | `/dashboard`, `/settings`, `/waitlist`, `/workflows/<id>` → 307 to `/login?next=…` |
| Logged-out API | `/api/credentials` GET → 401; `/api/lookup` POST → 401; `/api/workflows/<id>` GET → 405 (no GET handler) |
| Inngest endpoint | unsigned GET `/api/inngest` → 401 "No x-inngest-signature provided" — signed production mode, not dev |
| Per-deployment URL | `wfloai-eus5vox9f-…vercel.app` → 302 to Vercel SSO (protected) |
| Security headers | HSTS, CSP `frame-ancestors 'none'`, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy present |
| Inngest app sync | **not observed** — no Inngest PUT to `/api/inngest` in runtime logs yet |

Not yet evidenced (needs a human or a provider dashboard): signed-in Google login
round trip, invite gate, a manual run, Gmail connect, Inngest sync + scheduled run,
and the service-role key's target (proven by the first scheduled run).
