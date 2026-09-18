# WfloAI — V1 operations runbook

Two sections, both scoped to V1: **rollback and recovery**, and the **support and
incident path**. It builds no new mechanism — every action below uses a switch
that already exists. Authored in Task 13; Task 17 Gates 13 and 15 verify it.

Every action here is a production action and belongs to the operator. The SQL
runs in the Supabase SQL editor of the **production** project, which runs as a
privileged role and bypasses RLS — read the `where` clause twice.

Placeholders the operator fills in: `<CANONICAL_HOST>` (see
[DEPLOYMENT.md](DEPLOYMENT.md) §1), `<SUPPORT_ADDRESS>`, `<OPERATOR_NAME>`.

---

## 1. Rollback and recovery

### 1.1 Roll back the application

Vercel keeps every prior production deployment.

1. Vercel → Project → **Deployments** → find the last known-good production
   deployment (match its commit SHA against `RELEASE_PROGRESS.md`).
2. **⋯ → Instant Rollback**, or `vercel rollback <deployment-url-or-id>`. The
   domain moves to that deployment without a rebuild. Rolling back to a
   *specific older* deployment (not just the previous one) requires the Pro or
   Enterprise plan — confirm which plan the project is on before relying on it.
3. Verify with DEPLOYMENT.md §5 rows 1, 3, 4, 19, 20 and 21.
4. If Git auto-deploy is on, the next push to `main` deploys forward again.
   Revert or fix on `main` before pushing.

A rollback changes **code only**. It does not undo a migration, restore data, or
change an environment variable.

### 1.2 Re-close admission (the signup gate, Task 08)

Admission is `profiles.approved`, and the only self-service way in is an invite
code. To stop new entry immediately:

```sql
update public.invite_codes set disabled = true where disabled = false;
```

Already-approved accounts stay approved. To remove one user's access:

```sql
update public.profiles set approved = false where user_id = '<user-uuid>';
```

Revoking approval also **silently stops every schedule** that user owns — the
runner skips unapproved owners without writing a run row (CLAUDE.md, Scheduled
triggers). That makes it an effective containment switch, and a bad casual one.

### 1.3 Restore `INTEGRATION_TOKEN_KEY`

Procedure: [KEY-RECOVERY.md](KEY-RECOVERY.md). In short: restore the exact value
from the password-manager copy into Vercel → Environment Variables →
`INTEGRATION_TOKEN_KEY` (Production), then redeploy so new instances read it.
**There is no rotation path** — a new key makes every stored Gmail token and
credential permanently unreadable.

### 1.4 Restore the database

Supabase → Project → **Database → Backups**. Daily backups on paid plans; PITR
only if enabled. A restore replaces the whole database at a point in time, so
every write since then — users, runs, schedules, connections — is lost. It is a
last resort; prefer a targeted SQL correction when the damage is known.

Storage objects (`workflow-files`) are **not** part of a database restore.

### 1.5 Contacts

| Provider | Where to open a ticket | Identifier needed |
|---|---|---|
| Vercel (host) | vercel.com/help | Project name and deployment id — *operator to record* |
| Supabase | supabase.com/dashboard/support | Production project ref — `axelqoxblpchscksfwbx` if that project is chosen (DEPLOYMENT.md §1) |
| Inngest | app.inngest.com → Support | App id `wfloai`, production environment name — *operator to record* |
| Anthropic | console.anthropic.com → Help | Organization id — *operator to record* |
| Tavily | app.tavily.com → Support | Account email — *operator to record* |
| Google Cloud | console.cloud.google.com → Support | Project id of the Gmail OAuth client — *operator to record* |

### 1.6 What cannot be rolled back

- **An applied migration.** No migration in `supabase/migrations/` ships a down
  path. Reversal means writing one, or a restore (§1.4) with its data loss.
- **A sent email.** Gmail Send is delivered the moment it succeeds.
- **A fired HTTP mutation** (POST/PUT/PATCH/DELETE to a third party).
- **A created account.** It can be deleted, not un-created, and the invite seat
  it consumed stays consumed.
- **A regenerated `INTEGRATION_TOKEN_KEY`.**
- **A public announcement.**

---

## 2. Support and incident path

Deliberately minimal: no ticketing system, no status page, no on-call rotation.

### 2.1 How a user reports a problem

By email to **`<SUPPORT_ADDRESS>`** — *not yet chosen; OPERATOR INPUT REQUIRED.*
It must be the same address published in the privacy policy and terms (their
"Contact" sections currently show a visible placeholder, deliberately not
invented) and findable from `/help`. One address, not two.

### 2.2 Where the report goes

The `<SUPPORT_ADDRESS>` inbox, watched by **`<OPERATOR_NAME>`**. The Task 02
error-reporter notifications, once a vendor is chosen, go to the same inbox.

### 2.3 How the operator responds

1. **Acknowledge** the report.
2. **Assign a severity:**
   - **S1** — unwanted external side effects happening now (email, HTTP
     mutations), data exposure, or unbounded spend → contain first (§2.4)
   - **S2** — a core flow broken for many users (sign-in, runs, schedules)
   - **S3** — a single user, or cosmetic
3. **Contain** (§2.4) before diagnosing an S1.
4. **Record** the incident (§2.5).

### 2.4 Containing dangerous scheduled or integration behaviour

Existing switches only, narrowest first:

| Situation | Action |
|---|---|
| One schedule misbehaving | The owner turns it off in Workflow Settings, or `update public.workflow_schedules set enabled = false, next_run_at = null where id = '<schedule-uuid>';` |
| One user's schedules | `update public.workflow_schedules set enabled = false, next_run_at = null where user_id = '<user-uuid>';` |
| **All** schedules | First record them: `select id, user_id from public.workflow_schedules where enabled;` then `update public.workflow_schedules set enabled = false, next_run_at = null where enabled;` |
| One user's Gmail sending | `update public.gmail_connections set status = 'requires_reconnect', access_token_encrypted = null, access_token_expires_at = null where user_id = '<user-uuid>';` — Send fails fast until the user reconnects (`lib/gmail/client.ts`). This does not revoke at Google |
| Restricted Gmail actions exposed | Vercel env `GMAIL_READ_ACTIONS_ENABLED` → `false` (or remove it), then redeploy. It defaults off |
| A stored credential being abused | The owner deletes it in Settings, or `delete from public.user_credentials where id = '<credential-uuid>';` — HTTP nodes using it then fail |
| A user abusing the product | Revoke approval (§1.2) — stops their pages, spending routes and schedules |
| New sign-ups must stop | Disable invites (§1.2) |
| Spend running away | Lower the Anthropic and Tavily console caps (Task 03), or revoke the production API key at the provider |
| A bad deploy | Roll back (§1.1) |

Every one of these is a production action. Record which was taken.

### 2.5 What to capture for each incident

- Start, detection, containment and end times (UTC)
- Affected users (user ids — never emails in shared notes)
- Workflow ids and `workflow_runs` ids involved
- External side effects that **actually occurred** — sends and HTTP mutations
  (`integration_action_executions` rows with `status = 'succeeded'`)
- The containment step taken, and by whom
- Root cause once known, and the commit that fixed it

Record it in `RELEASE_PROGRESS.md`'s manual-action log, or in a dated incident
note alongside it.
