# Objective

Control who gets an account. Every cost and abuse control in this plan is downstream of admission — and gating is also the cheapest mitigation available while task 03's durable quotas are still being built.

# Audit Items

**A3** (open signup with zero gating)

# Current State

Authentication is Google OAuth only (`components/auth/login-card.tsx:25`). There is no email/password path.

There is **no allowlist, waitlist, invite code, domain restriction, or `profiles` table anywhere in the application.** Anyone with a Google account who reaches the login page gets a full account, immediately, with access to the shared Anthropic and Tavily keys.

Supabase CAPTCHA is not enabled on the auth endpoints.

One useful accident of the current state: while the Google OAuth app remains in **Testing** mode, Google's unverified-app user cap acts as a de facto gate. That is sufficient for Phase 1 (5–10 known people) and should be leaned on rather than replaced. It stops being sufficient the moment the app is verified and published, which is exactly when this task must be done.

# Required Changes

- [x] Add a `profiles` table via migration, keyed to `auth.users(id)` with `on delete cascade`, carrying at minimum an approval flag. Follow the project convention: RLS enabled, per-user `auth.uid() = user_id` policies.
- [x] Choose and implement **one** gating mechanism — invite code or waitlist approval. Both work; picking both doubles the surface for no benefit.
- [x] Enforce the gate in `middleware.ts`. This must coordinate with task 01's allow-list inversion — an approved-user check layered on top of the auth check, not a second competing path list.
- [x] Ensure an unapproved authenticated user lands somewhere coherent (a "you're on the waitlist" page), not a broken dashboard or a redirect loop.
- [x] Ensure the gate cannot be bypassed by navigating directly to an API route. The middleware check is not sufficient on its own for API routes that already do their own `getUser()` — decide where the approval check lives and make it consistent.
- [ ] Enable **Supabase CAPTCHA** (hCaptcha or Turnstile) on the auth endpoints. Do this regardless of which gating mechanism is chosen.
- [x] Provide an approval path for the operator. A SQL update is acceptable for V1 — an admin UI is not required and would expand scope.

# Implementation record (2026-09-16)

## Invite code, not waitlist-approval — and the repository decides this

The Stop Condition says the choice *"depends on how you intend to recruit users"*. That is answered in MASTER section 4: Phase 2 is an invite-only public beta capped at 50–100, and **"strangers get in here, but only behind an invite gate."** Operator-approval-only does not fit that — it requires the operator to act on every stranger who signs up. So: invite code, and **Manual Step 1 remains yours to confirm**, with the reasoning recorded rather than assumed.

It is still **one** mechanism, not both. `profiles.approved` is the gate; redeeming an invite code is the one self-serve way to pass it; a SQL update is the operator way, which the task explicitly permits for V1. The invite code does not gate anything on its own — it writes the flag.

## Schema

Migration `202609160001_add_profiles_and_invites.sql`. **Written and reviewed locally; not applied to any remote database.**

- **`profiles`** — `user_id` PK referencing `auth.users(id) on delete cascade`, `approved` defaulting false, `approved_at`, `invite_code_used`. RLS on, with a select-own policy and **deliberately no update policy**: `approved` is the gate, so a user who could update their own row could open it. It is written only by `redeem_invite_code` (security definer) or by the operator.
- **`invite_codes`** — `code` PK, `max_uses`, `uses`, `expires_at`, `disabled`, `note`. RLS enabled **with no policies at all**, so anon and authenticated clients can neither read nor write it. A readable code table defeats the gate.
- **`handle_new_user()`** trigger on `auth.users` insert, so a first-time Google login has a row for the gate to read.
- **`redeem_invite_code(p_code)`** — security definer, returns an outcome string rather than raising so the route can map it without parsing an error. `select ... for update` on the code row is what makes `max_uses` real: two people redeeming the last use concurrently would otherwise both observe `uses < max_uses`. Redeeming while already approved returns early rather than burning a use.

## Where the gate is enforced, and why in three places

**Pages** — `proxy.ts`, layered on top of task 01's auth check rather than beside it. `requiresApproval()` in `lib/auth/approval.ts` delegates to `requiresAuth()`: a page that never needed a session does not need approval either, so the two compose instead of competing, and there is no second path list to drift. The waitlist page is the one authenticated page excluded, or the redirect loops forever.

Approval is read **live on every request**, not from the session. That is what makes the task's manual step — *"approve that account and confirm access begins working without requiring a re-login"* — actually true.

**Money-spending API routes** — the proxy deliberately does not gate `/api/`, and these routes are reachable directly, so each checks admission itself: `/api/execute`, `/api/lookup`, **`/api/workflows/[id]/execute`**, and `/api/workflows/[id]/schedules/[scheduleId]/run`. The task names only the first two; the third is the primary run path and spends more than both, the same gap task 03 found in its metering.

**The scheduled path** — `runScheduledWorkflow` skips an unapproved account. A schedule created before approval was revoked would otherwise keep spending on its own timetable with nobody signed in, which is precisely the *"a gate that only covers pages is not a cost control"* failure in its least visible form.

`isApprovedUser` **fails closed**: a missing row, an RLS denial and a transport error are all "not approved". The gate must not open because a query failed.

## Unapproved experience

`/waitlist` renders in the existing auth card layout: who you are signed in as, an invite-code field, a note that no code is needed if you are being let in from the list, and a sign-out button. An approved user who lands there is sent to `/dashboard` by the proxy, and by the page itself as defense in depth, so it can never be a dead end. `POST /api/invite/redeem` carries task 01's `isSameOrigin` check like every other mutation.

No redirect loop is possible by construction: `requiresApproval(WAITLIST_PATH)` is false, and that is asserted by a test rather than left to inspection.

## Existing accounts are left unapproved — deliberately, and it is your call

The backfill gives every existing `auth.users` row a profile with `approved = false`. This is the shape task 08 Manual Step 4 assumes (*"seed the approval list ... or you will lock yourself out"*), and the Stop Condition about retroactively de-authorising real accounts is why the migration does not guess. The grandfathering alternative — one changed statement — is written out in the migration's operator notes. Which is right depends on who already has an account, which is a fact about the database rather than about this repository. **Nobody is locked out today: the migration has not been applied anywhere.**

## CAPTCHA — not done, and it cannot be

Required Change 6 needs an hCaptcha or Turnstile account and a secret key, and the configuration lives in the Supabase dashboard rather than in this repo. Creating secrets and changing provider configuration are both MASTER section 7.1 hard stops and this task's own third Stop Condition. **Nothing was created and nothing was configured.** Manual Steps 2 and 3 are the whole of it.

## What the tests assert, and what they cannot

`tests/approvalGate.test.ts`: which paths need approval (including that the waitlist page does not, and that the gate composes with the task 01 allow-list rather than restating it); that `isApprovedUser` fails closed on an unapproved row, a missing row and a query error; that each of the four money-spending routes still calls the guard; and that the scheduled path still skips an unapproved account.

The last two read source rather than behaviour. That is a deliberate trade: there is no HTTP harness here, and what they actually protect against is a future edit dropping the check from one route while the others keep it.

**The four behavioural checkboxes stay unticked.** *"An unapproved user is denied a protected route"*, *"denied by the API routes that spend money"*, *"an approved user is unaffected"*, and *"a profiles row is created on first login, and RLS prevents a user reading another user's row"* all need a live Postgres and a request cycle. The decision logic underneath each is tested; the round trips are not, and MASTER section 7.7 puts building that harness out of bounds. They are recorded here rather than faked, and are natural candidates for task 12's CI work.

## Outstanding

- **Apply the migration** to the remote database — operator action, hard stop for an agent.
- **Seed the approval list** with your own account and your Phase 1 testers **before** the gate reaches an environment with real accounts, or decide to grandfather instead. The SQL for both is in the migration.
- **Create the hCaptcha or Turnstile account, provision the keys, and enable CAPTCHA** in the Supabase dashboard (Manual Steps 2 and 3).
- **Confirm invite code over waitlist approval** (Manual Step 1).
- **Keep the Google OAuth app in Testing mode through Phase 1** (Manual Step 5) — the unverified-app cap is still doing real work and this gate does not replace it.
- **HUMAN_UI_CHECK_REQUIRED:** a fresh Google account landing on the waitlist rather than a broken dashboard; approval taking effect without a re-login; no loop from `/`, `/settings` or a workflow URL; and the CAPTCHA challenge actually appearing in the flow.

# Addendum (2026-09-17) — invite launch track

**Superseded above:** existing accounts are **grandfathered approved** by `202609160001` (the migration was changed before it was applied), and all five September migrations have since been applied by the operator. The "left unapproved" section above describes an earlier draft.

**Invite page copy.** `/waitlist` no longer says "You are on the list" or that nothing more is needed. It says WfloAI is invite-only, that a valid code unlocks access immediately, and that access is not granted by waiting. The route path is unchanged, so the proxy, the tests and the allow-list are untouched.

**Durable attempt limiting — migration `202609170001_add_invite_redemption_rate_limit.sql` (OPERATOR_MIGRATION_REQUIRED, not applied).** The limit is **inside `redeem_invite_code`**, not in the route: the function is granted to `authenticated`, so any signed-in user can call it straight through PostgREST and never touch `/api/invite/redeem`. 5 attempts per 15 minutes and 20 per day, per user, counted in a new `invite_redemption_attempts` table with a read-own policy and **no client write policy**, so the window cannot be backdated or emptied. A per-user advisory lock makes count-then-insert atomic under concurrency; the code-row `FOR UPDATE` still guards the last seat. The `integration_action_executions` ledger was deliberately **not** reused: its UPDATE policy lets a user rewrite their own `pending`/`failed` rows, which would reset an attempt window. The route maps the new `rate_limited` outcome to **429** with `Retry-After`.

The same migration **revokes `anon` EXECUTE** on `redeem_invite_code` and `consume_action_quota`. Supabase's default privileges grant EXECUTE on new public functions directly to `anon`, and the earlier `revoke ... from public` does not remove a direct role grant. Neither function did anything for anon, but the intended grant set is now true by construction.

**Verified locally** against an in-memory Postgres (PGlite) with Supabase-shaped roles, `auth.uid()` and default privileges: 49/49 — every outcome, the rate limit and its expiry, last-seat, self-approval via UPDATE/INSERT denied, attempt rows not client-writable, anon grant removed. PGlite is single-connection, so true parallel redemption was not exercised; it rests on the advisory lock and `FOR UPDATE` by construction. `tests/inviteRedeem.test.ts` covers the route; `tests/proxyAdmission.test.ts` runs the real `proxy()` for approved, unapproved and anonymous users, **which ticks the "denied a protected route" and "approved user is unaffected" boxes below at the proxy level.**

**Residual, accepted for V1:** the limit is per account, so someone with many Google accounts gets more guesses. A universal code of 128+ bits makes that irrelevant; a short human-chosen code does not. CAPTCHA remains outstanding as above.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] Test: an authenticated but unapproved user is denied access to a protected route. (`tests/proxyAdmission.test.ts`)
- [ ] Test: an authenticated but unapproved user is denied by the API routes that spend money — `/api/execute` and `/api/lookup` specifically. A gate that only covers pages is not a cost control.
- [x] Test: an approved user is unaffected. (`tests/proxyAdmission.test.ts`)
- [ ] Test: a `profiles` row is created on first login, and RLS prevents a user reading another user's row.

**Manual**

- [ ] Sign up with a fresh Google account and confirm you land on the waitlist page, not the dashboard.
- [ ] Approve that account and confirm access begins working without requiring a re-login (or, if re-login is required, that the UI says so).
- [ ] Confirm CAPTCHA is actually enforced on the auth endpoint — check the Supabase dashboard setting **and** observe the challenge in the flow.
- [ ] Confirm no redirect loop exists for an unapproved user hitting `/`, `/settings`, or a workflow URL directly.

# Stop Conditions

Stop and ask before proceeding if:

- **Enabling public signup** is the next step. Hard stop — that is the operator's decision and marks the end of Phase 3.
- The `profiles` migration would need to be applied to a remote or production database. Create and review locally; do not push.
- Enabling CAPTCHA requires creating an hCaptcha or Turnstile account and a secret key. **Creating secrets is a hard stop** — document what is needed.
- Existing users would be locked out by the new gate. Retroactively de-authorizing real accounts is an operator decision, and getting it wrong locks out your own beta testers.
- The choice between invite code and waitlist depends on how you intend to recruit users. That is product strategy, not implementation.
- The gate interacts with task 01's middleware inversion in a way that is not cleanly layered.

# Completion Criteria

- `profiles` table exists with RLS, migration reviewed and recorded as not yet applied remotely.
- One gating mechanism implemented and enforced in middleware.
- Unapproved users cannot reach protected pages **or** the money-spending API routes.
- A coherent waitlist page exists; no redirect loops.
- CAPTCHA enabled and observed working.
- An operator approval path exists and has been exercised at least once on a real account.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Choose invite code vs waitlist.** Depends on how you plan to recruit.
2. **Create the hCaptcha or Turnstile account** and provision the site/secret keys. Add them to the host environment; never commit them.
3. **Enable CAPTCHA in the Supabase dashboard** — Authentication → Settings. Configuration lives in the dashboard, not in this repo.
4. **Seed the approval list** with your own account and your Phase 1 testers before deploying the gate, or you will lock yourself out.
5. **Keep the Google OAuth app in Testing mode through Phase 1.** The unverified-app cap is doing real work; do not publish early.
