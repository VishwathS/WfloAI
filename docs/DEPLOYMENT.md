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

WfloAI has **exactly one** canonical production origin:

```
https://<CANONICAL_HOST>
```

`<CANONICAL_HOST>` is an operator-owned custom domain. **Not yet chosen —
OPERATOR INPUT REQUIRED.** The recommended shape is the apex (`example.com`)
with `www.example.com` permanently redirecting to it.

Rules that follow:

1. **A custom domain is required, not optional.** Google's OAuth verification
   (Task 14) needs an authorized domain the operator can verify in Search
   Console, with the homepage and privacy policy on it. A `*.vercel.app` address
   cannot be verified by you, so it cannot be the canonical origin.
2. **Every non-canonical origin redirects to the canonical one** — `www` or apex
   (whichever is not canonical) with a 308, configured in Vercel's domain settings.
3. **The `*.vercel.app` production alias is not canonical and not OAuth-capable.**
   It serves the app, but sign-in and Gmail connect fail there because neither
   origin is registered.
4. **Preview deployments are not OAuth-capable.** Every preview has its own
   origin, and both Supabase Auth and Google match redirect URIs exactly. Signing
   in or connecting Gmail on a preview URL fails **by design**; it is not a bug.
   A preview pass proves nothing about production OAuth.

Why this matters in code: there is no site-URL variable. Every redirect is built
from the incoming request's origin — `app/auth/callback/route.ts`,
`components/auth/login-card.tsx`, `app/api/integrations/gmail/connect/route.ts`
and `.../callback/route.ts`. The origin a user arrives on *is* the origin OAuth
uses, and rule 2's redirect is what keeps it to one.

URLs registered from this decision (Task 14 consumes these):

| Where | Value |
|---|---|
| Supabase Auth → Site URL | `https://<CANONICAL_HOST>` |
| Supabase Auth → Redirect URLs | `https://<CANONICAL_HOST>/auth/callback` |
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

**Open decision — OPERATOR INPUT REQUIRED. This is a Task 13 Stop Condition.**

As of 2026-09-17 the development environment and the project certified during
the invite launch track are **the same project**:

- `.env.local` → `NEXT_PUBLIC_SUPABASE_URL` points at project `axelqoxblpchscksfwbx`
- `supabase/.temp/project-ref` (the CLI link) is `axelqoxblpchscksfwbx`
- the read-only Supabase MCP in `.mcp.json` is scoped to `axelqoxblpchscksfwbx`

Task 13 treats dev == prod as a data-safety problem: local runs (with
`INNGEST_DEV=1`) spend and write against the database real users are in, and
every "test against a test account" instruction in Tasks 15–16 loses its meaning.

Choose one and record it:

| Option | What it means | Cost |
|---|---|---|
| **A (recommended)** — keep `axelqoxblpchscksfwbx` as production | It already has every migration's schema, the approved users and the live invite. Point `.env.local` at a **new** development project (or a local `supabase start`), and re-link or unlink the CLI so `supabase db push` from this working copy cannot reach production | A new dev project, plus the 16 migrations applied to it |
| **B** — create a fresh production project | Apply all 16 migrations to it, recreate the invite, re-admit users, configure Auth | Existing approved users and data do not move |

Until this is decided, `PRODUCTION READY` cannot be claimed.

---

## 2. Environment variables

Regenerated 2026-09-17 from `process.env.*` reads in `app/ lib/ components/
hooks/ proxy.ts instrumentation.ts`, plus the SDK-implicit Inngest variables,
reconciled against `.env.local.example`. `tests/env.test.ts` now fails if code
reads a variable the example does not declare.

Set in Vercel → Project → Settings → Environment Variables, scope
**Production** (not Preview, unless you deliberately give previews their own
non-production values).

| Variable | Required | Exposure | Value comes from |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public (by design) | Supabase → Project Settings → API → Project URL of the **production** project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public (by design) | Same page → anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only, secret** | Same page → service_role key. Never `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | Yes | Server only, secret | Anthropic Console → a **production-only** key, distinct from dev |
| `TAVILY_API_KEY` | Yes | Server only, secret | Tavily dashboard → a **production-only** key, distinct from dev |
| `INTEGRATION_TOKEN_KEY` | Yes | Server only, secret | `openssl rand -base64 32`, generated once, backed up in two places **before** first use — see [KEY-RECOVERY.md](KEY-RECOVERY.md) |
| `GOOGLE_CLIENT_ID` | Yes | Server only | Google Cloud → production Gmail OAuth client (Task 14) — **not** the Supabase login provider's client |
| `GOOGLE_CLIENT_SECRET` | Yes | Server only, secret | Same client |
| `INNGEST_SIGNING_KEY` | Yes | Server only, secret | Inngest Cloud → production environment → Signing key |
| `INNGEST_EVENT_KEY` | Yes | Server only, secret | Inngest Cloud → production environment → Event key |
| `GMAIL_READ_ACTIONS_ENABLED` | No — set it anyway | Server only | Literal `false`. Setting it explicitly makes the V1 position visible in the env listing |
| `RETENTION_CLEANUP_ENABLED` | No | Server only | `true` in production **only** when you intend the retention sweep to delete (Task 12). Absent or anything else = the sweep deletes nothing |
| Error reporter DSN | No (Task 02) | Server only, secret | Only after a vendor is chosen **and** listed in the privacy policy |
| `INNGEST_DEV` | **Must be absent** | — | Never. The app refuses to boot with it set (`lib/config/env.ts`) |

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
run it. If the ledger should be made truthful, the fix is
`supabase migration repair --status applied <version>` for each of the ten. That
writes to the remote ledger, so it is operator-only, and only after re-running
the schema check below.

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
2. **Choose `<CANONICAL_HOST>`** and own the domain.
3. **Create the Vercel project** from the GitHub repository `VishwathS/WfloAI`:
   framework Next.js, root directory `/`, default build and install commands,
   production branch `main`.
   - **Decide auto-deploy before pushing again.** With the Git integration on,
     every push to `main` is a production deployment. If deploys should be
     deliberate, turn off automatic production deployments (or use a separate
     production branch) and promote by hand.
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
| 2 | Non-canonical redirects | `curl -sI` on the sibling host | `308` → `https://<CANONICAL_HOST>/` | agent-verifiable |
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
