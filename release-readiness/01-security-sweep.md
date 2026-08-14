# Objective

Close five small, unambiguous security gaps in one reviewable pass. None require design decisions; together they are roughly one hour of code plus a migration. This task goes first because it is cheap, because two of the items (A4, A5) are the kind of finding that torpedoes an OAuth review, and because **A15 changes what the rest of the Gmail plan is** — it is the difference between "V1 needs sensitive-scope verification" and "V1 needs a full CASA security assessment."

# Audit Items

**A4** (`/settings` unprotected) · **A5** (protocol-relative open redirect) · **A13** (idempotency-ledger UPDATE policy) · **A15** (`gmail.compose` is a Restricted scope) · **A6** (security headers + CSP — split, see below) · **B3** (CSRF `Origin` check)

A6 is split inside this task: the plain headers are Phase 1, the full CSP is Phase 3. Do not let the CSP hold up the headers.

# Current State

### A4 — `/settings` not covered by the middleware auth gate

`middleware.ts` gates by an explicit list:

```ts
function isProtectedPath(pathname: string) {
  return pathname === "/" || pathname.startsWith("/workflows");
}
```

`/settings` is not covered, and `app/(dashboard)/settings/page.tsx` has no server-side `getUser()` check of its own. The matcher is `["/((?!_next/static|_next/image|favicon.ico).*)"]`, so the request does reach middleware — the path list is what excludes it.

Nothing leaks *today*: the APIs behind the page all 401. But this is fail-open on the page that manages OAuth tokens and third-party API keys, and it is a **deny-list shape** — every future dashboard route inherits the bug by default.

### A5 — protocol-relative open redirect in the OAuth callback

`app/auth/callback/route.ts`:

```ts
const next = requestUrl.searchParams.get("next") ?? "/";
const safeNext = next.startsWith("/") ? next : "/";
```

`//evil.com` passes `startsWith("/")`, and `new URL("//evil.com", origin)` resolves to `https://evil.com`. This is a post-authentication open redirect — a phishing primitive.

The same weak check exists at `components/auth/login-card.tsx:21`.

Separately, the same file discards the result of `exchangeCodeForSession(code)` — a failed exchange redirects silently as though it succeeded.

### A13 — users can UPDATE and DELETE their own idempotency-ledger rows

`supabase/migrations/202607190003_add_integration_action_executions.sql` grants users UPDATE on their own rows in `integration_action_executions`. Because `claimAction` reclaims rows in `failed` state via a conditional UPDATE, a user can flip `succeeded` → `failed` and cause a re-send of an action that already executed. This defeats an invariant CLAUDE.md lists as non-negotiable.

DELETE is the same class of problem for a different reason: the Gmail and HTTP quotas in `lib/integrations/limits.ts` are derived by **counting rows in this table**, so DELETE is a quota-reset primitive.

Blast radius is self-only — a user can only re-send their own actions and reset their own quota — which is why this was re-tiered out of blocker status. It rides along here because the fix is one migration.

Users only need `SELECT`.

### A15 — `gmail.compose` is a Restricted scope, and CLAUDE.md says otherwise

`lib/gmail/scopes.ts` requests `gmail.send gmail.compose` at initial connect. Google's Gmail API scopes documentation classifies:

| Scope | Classification |
|---|---|
| `gmail.send` | **Sensitive** |
| `gmail.compose` | **Restricted** |
| `gmail.readonly` | **Restricted** |

CLAUDE.md's Gmail launch-strategy section states the strategy as *"Initial connect requests `gmail.send gmail.compose` only"*, treating `gmail.readonly` as the sole restricted launch dependency. **That premise is factually wrong.** As built, the initial connect requests a Restricted scope, which puts the *entire* Gmail integration behind the security-assessment wall — not just the read actions.

`GMAIL_READ_ACTIONS_ENABLED=false` does **not** mitigate this. That flag gates *actions*; the scope is requested at *connect time* regardless of which actions are enabled.

### A6 — no security headers at all

`next.config.mjs` has no `headers()` export. Nothing sets CSP, HSTS, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.

Related: `app/global-error.tsx:27` renders `error.message` directly to end users.

### B3 — no CSRF tokens

Protection currently rests entirely on Supabase's `SameSite` cookie defaults, which do block cross-site POSTs in current browsers. This is therefore defense-in-depth rather than an active hole. `POST /api/integrations/gmail/disconnect` takes no body and is the clearest theoretical target.

# Required Changes

- [ ] **A4** — Invert `isProtectedPath` in `middleware.ts` to an **allow-list**: public paths are `/login`, `/auth/*`, and (once task 07 lands) the marketing and legal routes. Everything else requires auth. Coordinate the public-path list with task 07 so the homepage and `/privacy` / `/terms` are not accidentally gated.
- [ ] **A4** — Add a `supabase.auth.getUser()` guard to `app/(dashboard)/settings/page.tsx` as defense in depth. Do not rely on middleware alone for the page that manages tokens.
- [ ] **A5** — Change the check to `next.startsWith("/") && !next.startsWith("//")` in **both** `app/auth/callback/route.ts` and `components/auth/login-card.tsx:21`. Prefer a single shared helper over two copies.
- [ ] **A5** — Handle the `exchangeCodeForSession` error result in `app/auth/callback/route.ts` rather than discarding it. On failure, redirect to `/login` with an error indication instead of silently proceeding.
- [ ] **A13** — New migration in `supabase/migrations/` dropping the user-facing UPDATE **and** DELETE policies on `integration_action_executions`. Leave SELECT. Confirm the service-role path (`lib/inngest/functions.ts`) and the claim path still work — they bypass RLS, so they should be unaffected, but verify rather than assume.
- [ ] **A15** — Remove `gmail.compose` from the initial connect scope tier in `lib/gmail/scopes.ts`. V1 ships **Send only** on the sensitive-scope path.
- [ ] **A15** — Move Create Draft behind the restricted gate alongside Find / Read / Reply, consistent with how `GMAIL_READ_ACTIONS_ENABLED` already hides actions from both the dropdown and execution.
- [ ] **A15** — **Correct the Gmail launch-strategy section of `CLAUDE.md`.** It currently asserts the wrong scope classification. This is not optional cleanup; leaving it means the next person re-derives the same wrong plan.
- [ ] **A6 (Phase 1)** — Add a `headers()` export to `next.config.mjs` setting `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and a frame-ancestors deny. ~20 minutes, near-zero breakage risk.
- [ ] **A6 (Phase 1)** — Stop rendering `error.message` to users in `app/global-error.tsx:27`. Show a generic message; the real error goes to the reporter added in task 02.
- [ ] **A6 (Phase 3, separate commit)** — Full CSP. Use the **non-nonce** form: nonce-based CSP forces every page to render dynamically, which would kill static optimization app-wide. Expect iteration against the React Flow canvas.
- [ ] **B3** — Shared `Origin`-header check helper applied to state-changing API routes, starting with `POST /api/integrations/gmail/disconnect`.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Add a unit test for the redirect-safety helper covering at minimum: `/dashboard` → allowed; `//evil.com` → rejected; `https://evil.com` → rejected; `/\evil.com` → rejected; `""` and `null` → default to `/`.

**Manual**

- [ ] Visit `/settings` while logged out → redirects to `/login`. Confirm in a private window, not just by logging out.
- [ ] Visit `/auth/callback?next=//example.com` → the resulting redirect stays on your origin.
- [ ] Every route that previously required auth still requires it after the allow-list inversion — walk the dashboard, a workflow canvas, and settings while logged out.
- [ ] `curl -I https://<domain>` shows each added header.
- [ ] **A13:** as a *normal authenticated user* (not service role), attempt `update integration_action_executions set status='failed' where id = <own row>` → expect RLS denial. Repeat for `delete`. A test that only exercises the service-role path proves nothing here.
- [ ] **A15:** the Google Cloud Console consent screen lists `gmail.send` and **no Restricted scope**. Verify this in the Console UI — not in code, and not from this document.
- [ ] Connect Gmail end-to-end after the scope change and confirm Send still works and Create Draft is hidden.

# Stop Conditions

Stop and ask before proceeding if:

- The A13 migration would need to be applied to a **remote or production** database. Create and review it locally; do not push it.
- Removing `gmail.compose` appears to break Send — that would mean the send path depends on compose in a way the audit did not find, and the fix is not obvious.
- Any existing Gmail connection would need its tokens **revoked, rotated, or re-consented** to accommodate the scope change. Changing what already-connected users hold is a decision for the operator, not the agent.
- The middleware allow-list inversion would gate a route you cannot confirm should be authenticated. Ask rather than guessing — the failure mode is either a locked-out user or an exposed page.
- The CSP work starts breaking the canvas in ways that require restructuring component code. That is a signal to defer the CSP to its own Phase 3 task, not to refactor the canvas.
- Anything in this task suggests touching the Google Cloud Console. The agent never modifies Google Cloud settings.

# Completion Criteria

- All `Required Changes` boxes checked, **except** the A6 Phase 3 CSP item, which may remain open and deferred to Phase 3 — this is the one explicitly permitted carve-out. If deferred, record that in `RELEASE_PROGRESS.md` Notes rather than marking it done.
- All three verification commands green.
- The A13 migration file exists, has been reviewed, and is **explicitly recorded as not yet applied remotely**.
- `CLAUDE.md`'s Gmail launch-strategy section reflects the corrected scope classification.
- Manual verifications performed and recorded — particularly the Console scope check and the RLS denial test, neither of which any automated test in this repo covers.
- `git diff` reviewed.

# Manual / External Steps

Operator-only. The agent documents; it does not perform.

1. **Google Cloud Console — verify scopes.** APIs & Services → OAuth consent screen → Data access (Scopes). Confirm the listed scopes are exactly what `lib/gmail/scopes.ts` requests after the A15 change, and that **no scope is marked Restricted**. This is the authoritative check; prose in any document, including this one, is not.
2. **Decide the Create Draft product tradeoff.** A15 costs the Create Draft action in V1. The alternative is a multi-week security assessment before *anyone* can connect Gmail at all. This is the operator's call to make explicitly, not a default to fall into.
3. **Apply the A13 migration** to the remote database once reviewed, using your normal migration process.
4. **Confirm the headers in production** after deploy with `curl -I` against the real domain — a local check does not prove the host isn't stripping or overriding them.
