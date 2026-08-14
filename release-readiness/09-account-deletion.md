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

- [ ] Add a deletion flow to `/settings` with a **typed confirmation** (the user types something specific, not just clicks OK). This is irreversible and unrecoverable.
- [ ] Implement the deletion in this **order — it is load-bearing**:
  1. **Revoke the Gmail grant at Google** using the existing `lib/gmail/oauth.ts` revocation function.
  2. **Delete Storage objects** under the `{user_id}/` prefix in `workflow-files`.
  3. **Delete the auth user** via the admin client, letting the cascade remove all nine tables' rows.

  Reversed, the Google grant is orphaned with no tokens left to revoke it with, and the storage objects are orphaned with no `user_id` context to find them by.
- [ ] Handle partial failure explicitly. If revocation fails, do not proceed to delete the tokens — that would strand the grant permanently. Report the failure and let the user retry.
- [ ] The admin client (`lib/supabase/admin.ts`) is required for `auth.admin.deleteUser()` — no user-scoped client can perform it. **CLAUDE.md has already been updated** to name authenticated self-service account deletion as the second sanctioned consumer; do not widen it further. The recorded constraints are binding:
  - The target `user_id` **must** come from `supabase.auth.getUser()` on the server in the same request.
  - It must **never** be read from the request body, query string, route param, header, or any other client-supplied value. An endpoint that accepts a target user ID is an account-deletion oracle for every account in the system.
  - Admin-client use is confined to deleting the caller's own auth user and the storage objects under their own `{user_id}/` prefix. Every other read and write in the handler stays on the user-scoped client where RLS applies.
- [ ] Data export: a JSON dump of workflows + runs, downloadable from Settings. Lower priority than deletion; ship deletion first.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Test the deletion sequence's ordering explicitly — a test that asserts revocation is attempted before token deletion.
- [ ] Test that a revocation failure aborts the deletion rather than proceeding.
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
