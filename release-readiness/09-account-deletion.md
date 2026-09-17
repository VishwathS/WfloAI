# Objective

Let users delete their account and everything associated with it, including revoking the Gmail grant at Google. Optionally, let them export their data.

The binding reason is not a statutory threshold — it is that task 07 publishes a privacy policy promising deletion, and **not honoring a published promise is an FTC Section 5 problem regardless of thresholds.** Google also expects users to have clear control over Google user data.

# Audit Items

**A8** (no account deletion or data export)

# Current State

There is **no deletion UI, no route, and no server action** anywhere in the application.

The database side is nearly free: all nine user tables carry `user_id uuid references auth.users(id) on delete cascade`, so deleting the auth user cascades the rows. Two things do **not** cascade:

1. **Storage objects.** Raw file bytes live in the private `workflow-files` bucket at `{user_id}/{workflow_id}/{fileId}`. CLAUDE.md already flags that deleting a workflow leaves storage objects orphaned. Account deletion has the same problem, at larger scale.
2. **The Gmail grant at Google.** Deleting `gmail_connections` removes the encrypted tokens from the database but leaves the OAuth grant standing in the user's Google account. That is a worse outcome than it sounds: the user believes they revoked access, and Google's permissions page says otherwise.

What already exists and should be reused: `lib/gmail/oauth.ts` contains a token-revocation function, already used by the Gmail disconnect route. Do not write a second one.

On statutory scope: deletion rights exist under GDPR and US state privacy laws, but most state laws key on thresholds around $25M revenue or 100k consumers, so WfloAI is likely below them today. The published-promise argument is the one that actually binds.

# Required Changes

- [x] Add a deletion flow to `/settings` with a **typed confirmation** (the user types something specific, not just clicks OK). This is irreversible and unrecoverable.
- [x] Implement the deletion in this **order — it is load-bearing**:
  1. **Revoke the Gmail grant at Google** using the existing `lib/gmail/oauth.ts` revocation function.
  2. **Delete Storage objects** under the `{user_id}/` prefix in `workflow-files`.
  3. **Delete the auth user** via the admin client, letting the cascade remove all nine tables' rows.

  Reversed, the Google grant is orphaned with no tokens left to revoke it with, and the storage objects are orphaned with no `user_id` context to find them by.
- [x] Handle partial failure explicitly. If revocation fails, do not proceed to delete the tokens — that would strand the grant permanently. Report the failure and let the user retry.
- [x] The admin client (`lib/supabase/admin.ts`) is required for `auth.admin.deleteUser()` — no user-scoped client can perform it. **CLAUDE.md has already been updated** to name authenticated self-service account deletion as the second sanctioned consumer; do not widen it further. The recorded constraints are binding:
  - The target `user_id` **must** come from `supabase.auth.getUser()` on the server in the same request.
  - It must **never** be read from the request body, query string, route param, header, or any other client-supplied value. An endpoint that accepts a target user ID is an account-deletion oracle for every account in the system.
  - Admin-client use is confined to deleting the caller's own auth user and the storage objects under their own `{user_id}/` prefix. Every other read and write in the handler stays on the user-scoped client where RLS applies.
- [x] Data export: a JSON dump of workflows + runs, downloadable from Settings. Lower priority than deletion; ship deletion first.

# Implementation record (2026-09-16)

## The ordering is the design, so it lives in its own module

`lib/account/deleteAccount.ts` runs the three steps in the declared order and **aborts at the first failure**, returning which step failed. It takes the steps as injected functions, which is what makes the ordering and the abort semantics testable as behaviour rather than inferred by reading the route.

1. **Revoke the Gmail grant at Google**, reusing `revokeToken` from `lib/gmail/oauth.ts`. No second revocation function was written; this is the same one the disconnect route uses.
2. **Delete the storage objects** under the caller's `{user_id}/` prefix.
3. **Delete the auth user**, letting the cascade take the rest.

A revocation failure deletes **nothing** — not the tokens, not the storage, not the account. Falling through would strand the OAuth grant in the user's Google account with no token left to revoke it with, which is the outcome A8 singles out: the user believes access was removed and the Google permissions page disagrees. The route reports the failed step with a message that says plainly what was and was not deleted, and the user can retry.

## Storage

`deleteStoragePrefix` walks the prefix a level at a time, because Supabase's `list()` is not recursive and objects live at `{user_id}/{workflow_id}/{fileId}`. It pages through each level, collects every real object (a folder placeholder has no `id`), and removes them in one call.

**Every error throws.** A partial storage deletion that reports success is worse than a clear failure, and it is an explicit Stop Condition for this task — so a listing error or a removal error aborts the whole deletion rather than being counted as progress.

## The admin client stayed narrow

The target is `user.id` from `supabase.auth.getUser()` in the same request, assigned once to a local and used from there. The route reads **no** identifier from the body, the query string, a route param or a header — the body is parsed only for the typed confirmation. An endpoint that accepts a target user id is an account-deletion oracle for every account in the system.

The admin client appears in exactly two places: `admin.auth.admin.deleteUser(userId)` and `deleteStoragePrefix(admin, userId)`. The Gmail connection is loaded with the **request-scoped** client, where RLS still applies, precisely so the admin client is not used "just for convenience" on a query the user-scoped client can do. A test asserts all of that from the source, including the absence of `admin.from(`.

`lib/supabase/admin.ts` carried a comment naming the Inngest path as the *only* consumer, which CLAUDE.md no longer says. It now names both, with the constraints, so the two do not drift.

## Typed confirmation

The user types `DELETE MY ACCOUNT` exactly; the button stays disabled until it matches, and the server re-checks it rather than trusting the client. On success the browser does a **full document navigation** to `/` rather than a soft one — the session is gone, so the router cache and every client component holding it must be discarded. That is the one lint suppression in this change, with the reason in the code.

## Export

`GET /api/account/export` returns workflows, schedules and run history as formatted JSON with a download filename, on the user-scoped client throughout — there is no reason for the admin client to appear in an export.

Two things are deliberately **not** in it, and the payload says so in a `notIncluded` field rather than silently omitting them: **Gmail tokens and stored API credentials**, which are encrypted secrets that the application never returns to a browser — exporting them would be the one place that rule broke — and **raw uploaded file bytes**, whose extracted text is already part of every run that used them.

## The privacy policy now matches

Task 07 shipped with a **Pending** callout saying self-service deletion did not exist, and its record said task 09 should replace it. It is replaced: the policy now describes deletion as available from Settings, says what it removes, says it revokes access at Google, and says it is immediate and unrecoverable. It also describes the export. Manual Step 3 asked for exactly this alignment; what remains there is the question of whether **backups** retain anything after deletion, which is a fact about the hosting and database setup that task 13 establishes, not something this repository can answer.

## Note on "nine tables"

The task says nine user tables. There are now **ten** — task 08 added `profiles`, which also carries `user_id references auth.users(id) on delete cascade` and so cascades with the rest. The manual verification should check ten. `invite_codes` is not user data and correctly has no `user_id`.

## What the tests assert

Real behaviour, with injected steps: the order actually executed; that a revocation failure calls neither later step; that a storage failure stops before the auth user is deleted; that a failure at the last step is still a failure; that the storage walk descends nested folders and removes every object; and that a listing error throws instead of reporting a partial success.

Source-level, because there is no HTTP harness: that the target id comes from the session, that no identifier is read from the request, that the admin client is confined to its two operations, and that the typed confirmation is enforced server-side.

**The client-supplied-ID checkbox stays unticked.** The task describes it behaviourally — *"call the deletion endpoint as user A with a body/param naming user B; assert user B still exists"* — which needs two live accounts and a real request. The property that makes it true is pinned here; the round trip is not, and it belongs with the other manual steps against a dedicated test account.

## Outstanding

- **Every manual verification line**, and all of it against a **dedicated test Google account** — using any other account is a hard stop, since the operation is irreversible.
- **Populate, delete, then check all ten tables individually** for that `user_id`. Do not sample.
- **Check the storage prefix is empty** and that **the grant is gone from the Google permissions page** (`myaccount.google.com` → Data & privacy → Third-party apps). The task calls the second one the check most likely to be skipped and most likely to fail; the application cannot perform it.
- **Confirm a deleted user cannot log back in and silently receive a fresh empty account** in a way that hides the deletion having worked. Worth noting: with task 08's gate in place, a returning deleted user gets a new unapproved profile and lands on `/waitlist`, which makes this visible rather than silent.
- **Confirm the export JSON** parses and contains what it should.
- **Backup retention** — if backups keep data after deletion, the privacy policy must say so (Manual Step 3). Task 13 establishes what the backup regime actually is.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] Test the deletion sequence's ordering explicitly — a test that asserts revocation is attempted before token deletion.
- [x] Test that a revocation failure aborts the deletion rather than proceeding.
- [ ] **Test that a client-supplied user ID is ignored.** Call the deletion endpoint as user A with a body/param naming user B; assert user B still exists and user A was deleted (or the request was rejected outright). This is the test that proves the admin-client exception stayed narrow.

**Manual — must be performed against a dedicated test account**

- [ ] Create a test account. Populate it: a workflow, a schedule, an uploaded file, a Gmail connection, a stored credential, and at least one run.
- [ ] Delete it, then verify **zero rows remain in all nine tables** for that `user_id`. Check each table; do not sample.
- [ ] Verify **no objects remain** under `{user_id}/` in the `workflow-files` bucket.
- [ ] Verify the grant is **gone from the account's Google permissions page** (myaccount.google.com → Data & privacy → Third-party apps). This is the check most likely to be skipped and most likely to fail.
- [ ] Verify the deleted user cannot log back in and silently receive a fresh empty account in a way that hides the deletion having worked.
- [ ] Export: confirm the JSON dump contains the user's workflows and runs and is valid JSON.

# Stop Conditions

Stop and ask before proceeding if:

- Testing would run against **any account that is not a dedicated test account**. Hard stop. This operation is irreversible.
- The deletion would touch production data as part of development or verification.
- Admin-client usage would extend beyond `auth.admin.deleteUser()` and the caller's own storage prefix — for example, using it "just for convenience" on a query that the user-scoped client could do. The admin client bypasses RLS; scope creep here is a security problem, not a style problem. CLAUDE.md's two-consumer list does not grow by precedent.
- The design would require the target user ID to arrive from the client for any reason (an admin tool, a support flow, a batch cleanup). That is a different feature with a different threat model — stop and raise it rather than widening this one.
- Storage deletion under a `{user_id}/` prefix cannot be done reliably — a partial storage deletion that reports success is worse than a clear failure.
- Revocation behavior against Google is unclear or intermittent. Do not paper over it with a swallowed error; task 02 exists precisely so this is visible.

# Completion Criteria

- Deletion flow live in Settings with typed confirmation.
- Correct ordering implemented and covered by a test.
- Partial-failure handling implemented — no silent stranding of the Google grant.
- Verified end to end on a test account: nine tables empty, storage prefix empty, Google grant gone.
- The admin client is used only for `auth.admin.deleteUser()` and the caller's own storage prefix; the target `user_id` provably comes from `auth.getUser()`, covered by the client-supplied-ID test.
- Export shipped, or explicitly deferred with the reason recorded.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Create a dedicated test Google account** for this. Do not use your own.
2. **Verify the Google permissions page** yourself after the test deletion — the app cannot check this for you.
3. **Confirm the privacy policy's deletion language** (task 07) matches what this actually does, including how long deletion takes and whether anything is retained. If backups retain data for a period, say so.
