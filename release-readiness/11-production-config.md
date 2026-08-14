# Objective

Get the production environment configured correctly and prove it. This task is mostly **manual, external, and operator-owned** — the agent's job here is to document exact steps and to make sure the repository's environment documentation matches reality.

It contains the single most important manual verification in the whole plan: confirming the Inngest serve endpoint rejects unsigned requests.

# Audit Items

**A10** (Inngest signing key unset/unverified) · **B5** (Supabase production config) · **B6** (Google Cloud production setup) · **B9** (`INTEGRATION_TOKEN_KEY` backup procedure)

# Current State

### A10 — the one unauthenticated route

`app/api/inngest/route.ts` is the only route in the application without an auth check — correctly so, because its authentication is **request-signature verification**, not a session.

But `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` appear only as a **comment** in `.env.local.example:19-21`. They are not declared keys.

If the signing key is unset in production, the endpoint accepts unsigned requests. That endpoint triggers `runScheduledWorkflow`, which runs with the **service-role admin client**. A forged `workflow/schedule.due` event could therefore trigger arbitrary users' workflows — including Gmail sends. The failure mode is silent: nothing looks broken.

#### The two keys are not interchangeable

| | `INNGEST_SIGNING_KEY` | `INNGEST_EVENT_KEY` |
|---|---|---|
| **Direction** | Inngest → your app | Your app → Inngest |
| **Role** | Authenticates the serve endpoint at `app/api/inngest/route.ts`. Inngest signs each invocation; the SDK verifies and rejects unauthenticated requests in production. Also provides replay protection and signs responses back. | Authenticates your app when **publishing** events — the `workflow/schedule.due` sends from `checkDueSchedules` and from the per-schedule "Run now" route. |
| **If unset** | **Security failure, silent.** Endpoint accepts forged invocations into the service-role execution path. | **Functional failure, loud.** Event publishing is rejected; schedules never fire and "Run now" breaks. You notice immediately. |
| **Validated by the unsigned-POST test** | **Yes — this key is what that test exercises.** | **No.** A passing unsigned-POST test says nothing about the event key. |

Both must be set. Only the signing key is a security control, and only its absence is invisible — which is why A10's manual verification exists at all.

### B5 — Supabase production checklist

Not yet worked through. Per Supabase's going-into-prod guidance: Pro plan (prevents inactivity pausing), PITR if the database will exceed 4 GB, MFA on the account, SSL enforcement, network restrictions, CAPTCHA on auth (overlaps task 08), and confirmed backup retention. Additionally: **verify the `workflow-files` bucket is actually private in the production project** — it is private by design, but design is not verification.

### B6 — Google Cloud production setup

Needs: a separate production GCP project; consent screen published with accurate name, logo, and support email (branding mismatch is the most common rejection trigger); authorized domain verified in Search Console; production redirect URIs; scope justifications; and an unlisted demo video showing the consent flow with the OAuth client ID visible in the address bar. Sensitive-scope review takes up to roughly 10 days.

### B9 — key backup

`lib/crypto.ts` uses a versioned `v1:` envelope that anticipates rotation, but **no rotation path exists** — only `v1` decrypts. Losing or regenerating `INTEGRATION_TOKEN_KEY` orphans **every** stored Gmail refresh token and every stored credential, simultaneously and unrecoverably.

# Required Changes

Repository-side work only. Everything else is in `# Manual / External Steps`.

- [ ] **Declare `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` as real keys** in `.env.local.example`, not comments. Document the distinction above alongside them — the two-key confusion is the reason A10 exists.
- [ ] Document all required production environment variables in the README (coordinate with task 12 / B8, which rewrites it): `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INTEGRATION_TOKEN_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_READ_ACTIONS_ENABLED`, `TAVILY_API_KEY`, `ANTHROPIC_API_KEY`, plus the error-reporter DSN from task 02.
- [ ] Add a startup check that fails loudly if a required server-only variable is missing in production. A missing signing key currently produces silence; it should produce a refusal to start.
- [ ] Write the `INTEGRATION_TOKEN_KEY` recovery procedure into the repository documentation — where the key is stored, how to restore it, and what breaks if it is lost.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Test the startup check: with a required variable absent, the app refuses to start in production mode.

**Manual — these are the point of this task**

- [ ] **POST an unsigned request to `/api/inngest` in production and confirm it is rejected.** This is the single most important manual verification in the plan. Do it against the deployed URL, not locally — the local dev server runs unsigned by design, so a local test proves the opposite of what you need.
- [ ] Confirm `INNGEST_EVENT_KEY` works by triggering a schedule "Run now" and confirming the event is published and the run executes. This tests the *other* key; the unsigned-POST test does not cover it.
- [ ] Confirm the app is synced to Inngest Cloud and the functions are registered.
- [ ] Confirm the `workflow-files` bucket is private in the **production** project.
- [ ] Confirm backups are enabled and retained.
- [ ] Confirm `INTEGRATION_TOKEN_KEY` is stored in two independent places and that you have actually retrieved it from the backup once — an untested backup is not a backup.

# Stop Conditions

Every external item in this task is a hard stop for the agent. Specifically, stop and hand over before:

- **Deploying to production** or changing production infrastructure.
- **Creating, exposing, replacing, or rotating any secret** — including generating `INTEGRATION_TOKEN_KEY` or Inngest keys.
- **Modifying Google Cloud production settings**, including the consent screen, scopes, or redirect URIs.
- **Submitting Google OAuth verification.**
- Changing Supabase project settings, plan, or network restrictions.
- Making any irreversible production data change.

The agent's contribution to this task is `.env.local.example`, the README section, the startup check, and the recovery documentation. Nothing else.

# Completion Criteria

- Both Inngest keys declared in `.env.local.example` with the signing/event distinction documented.
- All required production variables documented.
- Startup check implemented and tested.
- `INTEGRATION_TOKEN_KEY` recovery procedure written down.
- **Operator-confirmed:** unsigned POST to production `/api/inngest` rejected; event publishing verified separately; Supabase checklist complete; `workflow-files` private in production; key backed up in two places and restore-tested.
- Manual items recorded in `RELEASE_PROGRESS.md` under Manual Actions — **not** as agent-completed work.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

### Inngest (A10)

1. Generate the signing key and event key in the Inngest dashboard.
2. Set both in the production host's environment.
3. Sync the app to Inngest Cloud and confirm the functions register.
4. **POST unsigned to the production `/api/inngest` URL and confirm rejection.** Do not skip and do not infer. Silent failure is the whole risk.
5. Separately confirm event publishing works via "Run now" on a schedule.

### Supabase (B5)

6. Upgrade to Pro — prevents inactivity pausing, which would stop scheduled runs.
7. Enable MFA on your Supabase account.
8. Enable SSL enforcement; review network restrictions.
9. Enable CAPTCHA on auth (also task 08).
10. Confirm backup retention; enable PITR if the database will exceed 4 GB.
11. Confirm the `workflow-files` bucket is private in the production project.

### Google Cloud (B6)

12. Create a **separate production GCP project**.
13. Publish the consent screen with accurate app name, logo, and support email. Branding mismatch is the most common rejection trigger — the name users see must match the name you submit.
14. Verify the authorized domain in Search Console.
15. Configure production redirect URIs.
16. Write scope justifications. **After task 01's A15 change this is `gmail.send` only** — a sensitive scope, not a restricted one. That distinction determines whether you need a security assessment.
17. Record an unlisted demo video showing the full consent flow with the OAuth client ID visible in the address bar.
18. Add the published privacy policy and terms URLs from task 07.
19. Submit for **sensitive-scope** verification. Expect ~10 days, longer with back-and-forth.

### Key backup (B9)

20. Store `INTEGRATION_TOKEN_KEY` in a password manager **and** the host's secret store.
21. Confirm the host will not silently regenerate environment variables.
22. **Test the restore path once.** Then write down what you did.
