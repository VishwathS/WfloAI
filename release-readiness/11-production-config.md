# Objective

Get the production environment configured correctly and prove it. This task is mostly **manual, external, and operator-owned** — the agent's job here is to document exact steps and to make sure the repository's environment documentation matches reality.

It contains the single most important manual verification in the whole plan: confirming the Inngest serve endpoint rejects unsigned requests.

> **Scope boundary with Tasks 13 and 14.** This task owns the **repository-side** artifacts (`.env.local.example`, the README env section, the startup check, the key-recovery documentation) and the written operator checklist. **Task 13** executes and records evidence for that checklist against the real production environment. **Task 14** owns all Google Cloud production work and **supersedes the §Google Cloud (B6) manual steps 12–19 below** — execute them there, not here, so the consent screen, scope justification, and verification submission have a single owner.

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

- [x] **Declare `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` as real keys** in `.env.local.example`, not comments. Document the distinction above alongside them — the two-key confusion is the reason A10 exists.
- [x] Document all required production environment variables in the README (coordinate with task 12 / B8, which rewrites it): `SUPABASE_SERVICE_ROLE_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INTEGRATION_TOKEN_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_READ_ACTIONS_ENABLED`, `TAVILY_API_KEY`, `ANTHROPIC_API_KEY`, plus the error-reporter DSN from task 02.
- [x] Add a startup check that fails loudly if a required server-only variable is missing in production. A missing signing key currently produces silence; it should produce a refusal to start.
- [x] Write the `INTEGRATION_TOKEN_KEY` recovery procedure into the repository documentation — where the key is stored, how to restore it, and what breaks if it is lost.

# Implementation record (2026-09-16)

Repository-side only, which is the whole of the agent's contribution to this task. Nothing in Inngest, Supabase or Google Cloud was touched, and no secret was generated, read or written.

## A10 — the two keys are now declared, and distinguished

`INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` were only ever a **comment** in `.env.local.example`. They are now real keys, with the direction-of-travel distinction written out beside them: signing is Inngest → app and its absence is a **silent security failure**; event is app → Inngest and its absence is a **loud functional failure**. The comment also says plainly that a passing unsigned-POST test says nothing about the event key, because that is the specific confusion A10 exists to prevent.

While in that file: the `GMAIL_READ_ACTIONS_ENABLED` comment still claimed *"Send and Create Draft need only sensitive scopes and remain available either way"*, which A15 made untrue. Corrected.

## The startup check — and the defect found while verifying it

`lib/config/env.ts` holds the required-variable list with a reason per entry, `missingServerEnv()` (which treats `""` and whitespace as missing, since a host setting a variable to empty is the more likely failure), and `assertServerEnv()`, which throws **in production only** — a hard failure in development would make the app unusable for anyone working on a single feature.

`instrumentation.ts` calls it at server boot and skips `phase-production-build`, because the build has no reason to hold production secrets and failing there would say nothing about the deployed environment.

**The first version passed every automated check and did not work.** Running `next start` with `NODE_ENV=production` and both Inngest keys genuinely absent, Next printed the error, printed **"Ready in 371ms"**, and then kept the process alive serving nothing for as long as it was left running. Next logs a failed instrumentation hook; it does not exit. That is still silence by the standard A10 cares about — a host would see a live instance rather than a failed boot.

The fix is an explicit `process.exit(1)` after reporting, guarded to the Node runtime. Re-verified the same way: the process now exits **1 in 1.4 seconds**, emitting one structured line through the project's own reporter:

```
{"level":"error","event":"startup.required_env_missing", ... "INNGEST_SIGNING_KEY (authenticating /api/inngest — without it the endpoint accepts unsigned requests into the service-role execution path)" ...}
```

That is the verification checkbox, done behaviourally rather than by inspection. `tests/env.test.ts` additionally pins every required variable individually, the empty-string case, that development is not blocked, that **both** Inngest keys are listed, that the message names each missing variable with its reason, that instrumentation skips the build phase, and that the explicit exit is still there — the last one because that is precisely the regression that would restore the original silence.

## B9 — the recovery procedure

`docs/KEY-RECOVERY.md`. It states what `INTEGRATION_TOKEN_KEY` encrypts (Gmail refresh and access tokens, every stored credential, the OAuth state cookie), that the `v1:` envelope anticipates rotation but **no rotation path is implemented**, and what losing it actually costs: every Gmail connection and every stored credential becomes unreadable at once, permanently, with no partial recovery — and because the application never returns a stored secret to a browser, users must re-enter secrets they may no longer have. Scheduled workflows then start failing on their own timetable with nobody present.

It also specifies what "two independent places" excludes, how to confirm the host will not regenerate the value, the restore test to perform **once** (retrieve from the password manager, compare byte-for-byte including padding, confirm a real connection still decrypts, then record the date in `RELEASE_PROGRESS.md`), and what to do if the key is believed exposed — which, with no rotation path, is a deliberate reset rather than a rotation.

## README

A **Production environment** section listing all ten required variables with the reason each is required, plus the two optional ones and their defaults. It states that the application refuses to start without them and points at `docs/KEY-RECOVERY.md`. Task 12 (B8) rewrites the README wholesale; this section is written to survive that, and the task text asks for the coordination explicitly.

## Scope boundary honoured

Every Google Cloud item (Manual Steps 12–19) is left for **Task 14**, per the scope-boundary note at the top of this file. Nothing here touches the consent screen, scopes, redirect URIs or verification submission.

## Outstanding — all operator, all hard stops for an agent

- **POST unsigned to the production `/api/inngest` and confirm rejection.** The single most important manual verification in the plan. It must be done against the deployed URL: the local dev server runs unsigned by design, so a local test proves the opposite of what is needed. Depends on Task 13.
- **Confirm `INNGEST_EVENT_KEY` separately** with a schedule "Run now". The unsigned-POST test does not cover it.
- **Generate both Inngest keys, set them in the host, sync to Inngest Cloud and confirm the functions register.** Generating keys is secret creation — a hard stop.
- **Supabase (B5):** Pro plan, MFA, SSL enforcement, network restrictions, CAPTCHA (also Task 08), backup retention and PITR if the database will exceed 4 GB, and confirm the `workflow-files` bucket is private **in the production project** — it is private by design, and design is not verification.
- **B9:** store the key in two independent places and **actually retrieve it from the backup once**. An untested backup is not a backup.
- **Google Cloud (B6):** Manual Steps 12–19, executed at **Task 14**, not here.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] Test the startup check: with a required variable absent, the app refuses to start in production mode.

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
