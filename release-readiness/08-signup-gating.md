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

- [ ] Add a `profiles` table via migration, keyed to `auth.users(id)` with `on delete cascade`, carrying at minimum an approval flag. Follow the project convention: RLS enabled, per-user `auth.uid() = user_id` policies.
- [ ] Choose and implement **one** gating mechanism — invite code or waitlist approval. Both work; picking both doubles the surface for no benefit.
- [ ] Enforce the gate in `middleware.ts`. This must coordinate with task 01's allow-list inversion — an approved-user check layered on top of the auth check, not a second competing path list.
- [ ] Ensure an unapproved authenticated user lands somewhere coherent (a "you're on the waitlist" page), not a broken dashboard or a redirect loop.
- [ ] Ensure the gate cannot be bypassed by navigating directly to an API route. The middleware check is not sufficient on its own for API routes that already do their own `getUser()` — decide where the approval check lives and make it consistent.
- [ ] Enable **Supabase CAPTCHA** (hCaptcha or Turnstile) on the auth endpoints. Do this regardless of which gating mechanism is chosen.
- [ ] Provide an approval path for the operator. A SQL update is acceptable for V1 — an admin UI is not required and would expand scope.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Test: an authenticated but unapproved user is denied access to a protected route.
- [ ] Test: an authenticated but unapproved user is denied by the API routes that spend money — `/api/execute` and `/api/lookup` specifically. A gate that only covers pages is not a cost control.
- [ ] Test: an approved user is unaffected.
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
