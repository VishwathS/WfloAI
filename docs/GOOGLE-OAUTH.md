# WfloAI — Google OAuth production (Task 14)

Operator material for releasing Gmail Send to real admitted users. The agent
prepared this; **every Google Cloud action is the operator's**, and nothing here
has been changed in any Console. `<CANONICAL_HOST>` is decided in
[DEPLOYMENT.md](DEPLOYMENT.md) §1 and is not chosen yet.

**V1 Gmail is Send Email on `gmail.send` only.** `gmail.compose` and
`gmail.readonly` are Restricted and stay deferred with D1. Nothing here requests,
adds or justifies either.

---

## 0. Blocker found 2026-09-17 — a fresh send-only connect cannot complete

**Severity: CRITICAL for Task 14. Needs an operator decision before a fix.**

After Gmail consent, `app/api/integrations/gmail/callback/route.ts` calls
`fetchGmailProfileEmail()` (`lib/gmail/oauth.ts`), which reads
`GET https://gmail.googleapis.com/gmail/v1/users/me/profile` to get the address
shown as "Connected as …".

Google's reference for `users.getProfile` accepts only `mail.google.com`,
`gmail.modify`, `gmail.compose`, `gmail.readonly` and `gmail.metadata`.
**`gmail.send` is not on the list.** Since A15 removed `gmail.compose` from the
connect tier, a user who grants only `gmail.send` gets a 403 there. The callback
catches it, records `gmail.oauth.exchange_failed`, and sends the user to
`/settings?gmail=error` — "Connecting Gmail didn't complete". **Every fresh V1
connect fails this way.**

It has stayed hidden because the only live connection (one `active` row in
`axelqoxblpchscksfwbx`) was made **before** A15 and still holds `gmail.compose`,
which does authorize `getProfile`.

The address is display-only (`gmail_connections.email`, `NOT NULL`, rendered in
Settings). Sending does not need it — Gmail sets `From` itself.

| Option | Change | Consequence |
|---|---|---|
| **A (recommended)** | Send tier requests `openid email https://www.googleapis.com/auth/gmail.send`; the callback reads the address from Google's OIDC userinfo endpoint instead of the Gmail profile | `openid` and `email` are **non-sensitive** and do not change the verification class. It does add scopes to the request and to the consent screen's data-access list — an operator decision, since widening the requested scope set is a hard stop for an agent |
| **B** | Keep `gmail.send` alone; stop fetching the address, store a neutral value, show "Gmail connected" | No scope change. Settings can no longer show which account is connected — which matters when the login account and the Gmail account differ — and the demo video loses "connected as" |

Until one is chosen and shipped, the Task 14 completion criterion — a fresh
non-test account connects and sends — **cannot pass**. Either fix is small and
testable, and gets its own commit and a redeploy.

### Existing connection with a Restricted scope

That one live row's `scopes` includes `gmail.compose`. It cannot be used — every
restricted action is refused while the flag is off — but it fails Task 14's
"`gmail_connections.scopes` records `gmail.send` and nothing Restricted" check.
Changing what an already-connected user holds is the operator's decision (Task 14
Stop Condition). The clean path, after the fix ships: that user **disconnects** in
Settings (which revokes the whole grant at Google), then reconnects.

### The Gmail client may not be separate from the login client

The same row also holds `openid`, `userinfo.email` and `userinfo.profile`, which
no version of the Gmail connect code has requested. They arrived through
`include_granted_scopes=true`, which merges grants the user had already given.
That suggests the Gmail OAuth client shares a client or Google Cloud project with
the Supabase Google **login** provider, while CLAUDE.md describes them as
separate. **Confirm in the Console**: compare the client ID under Supabase → Auth →
Providers → Google with `GOOGLE_CLIENT_ID`. If they share a project, they share
one consent screen, one publishing state and one verification.

---

## 1. Repository state verified (2026-09-17)

| Check | Result | Evidence |
|---|---|---|
| Send tier requests exactly `[gmail.send]` | Yes | `lib/gmail/scopes.ts`; regression test `tests/gmailConnectScope.test.ts` |
| A15 comment corrected ("compose is RESTRICTED") | Yes | `lib/gmail/scopes.ts` header |
| `.env.local.example` stale "Create Draft needs only sensitive scopes" line | Already corrected | `.env.local.example` |
| Create Draft / Find / Read / Reply refused by the executor from a crafted graph | Yes | `tests/gmailConsent.test.ts` |
| Same four hidden from the node dropdown | Yes | `tests/gmailConsent.test.ts` parses `GmailNode.tsx` |
| **`?tier=read` connect refused while the flag is off** | **Fixed in Task 14** — it was honoured for any signed-in user, requesting `gmail.compose` + `gmail.readonly` | `app/api/integrations/gmail/connect/route.ts`; `tests/gmailConnectScope.test.ts` |
| PKCE (S256) + sealed, user-bound, single-use state cookie | Yes | connect + callback routes |
| Redirect URI derived from the request origin | Yes — so only the canonical origin works | DEPLOYMENT.md §1 |

---

## 2. Console checklist (operator — do not submit until §0 is fixed and deployed)

### A. Google login (Supabase Auth)
1. Supabase → Authentication → Providers → Google: enabled, with the login
   client's ID and secret.
2. Supabase → Authentication → URL Configuration: Site URL
   `https://<CANONICAL_HOST>`; Redirect URLs `https://<CANONICAL_HOST>/auth/callback`.
3. Google Cloud → Credentials → the **login** client → Authorized redirect URIs:
   the production Supabase project's own callback, exactly as shown on
   Supabase's Google provider page (for `axelqoxblpchscksfwbx` that is
   `https://axelqoxblpchscksfwbx.supabase.co/auth/v1/callback`).

### B. Gmail OAuth client
4. Google Cloud → APIs & Services → Library → **Gmail API** enabled on the
   production project.
5. Credentials → the Gmail OAuth client (Web application). Its ID and secret go
   into Vercel as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### C. Consent screen and publishing
6. Google Auth Platform → Branding: app name **WfloAI**, logo, user support
   email and developer contact — **exactly** as the product shows them.
7. Audience → publishing status. In **Testing**, only listed test users can
   connect (100-user cap). That is fine for the invite beta, but Task 14's
   fresh-account test must use an account that is **not** a test user, which
   requires **In production**.

### D. Authorized redirect URIs (Gmail client)
8. Exactly one: `https://<CANONICAL_HOST>/api/integrations/gmail/callback`. No
   preview origins, no `*.vercel.app`, no localhost on the production client.

### E. Authorized JavaScript origins
9. Not required. Both flows are server-side redirects; no browser JavaScript
   calls Google.

### F. Test users
10. While still in Testing, list only the operator's own accounts — and do not
    use them for the fresh-account test.

### G. Scopes (Data access)
11. `https://www.googleapis.com/auth/gmail.send` — plus `openid` and
    `.../auth/userinfo.email` (non-sensitive) **only if §0 option A is chosen**.
12. **Confirm the Console marks no listed scope as Restricted.** If it does, stop.

### H. Domain and verification
13. Search Console: verify `<CANONICAL_HOST>`; add it under Branding →
    Authorized domains.
14. App homepage `https://<CANONICAL_HOST>/`, privacy policy `/privacy`, terms
    `/terms`. **The legal pages still carry `DRAFT — NOT REVIEWED BY COUNSEL`**;
    counsel review and banner removal (Task 07) come before submission.
15. Record the demo video (§4), then **submit for Sensitive-scope
    verification** and record the submission date. Approval is recorded only
    when the Console shows it.

---

## 3. Scope justification — `gmail.send`

Derived from `lib/gmail/actions.ts` and `components/canvas/nodes/GmailNode.tsx`.

> WfloAI is a visual workflow builder. A user adds a "Gmail — Send Email" step to
> a workflow they built, filling in recipient, subject and body (which can
> include text produced by earlier steps). When that workflow runs — manually, or
> on a schedule the user created and explicitly authorised to send unattended —
> WfloAI sends that one message from the user's own Gmail account via
> `users.messages.send`. `gmail.send` is the narrowest scope that permits
> sending: WfloAI never reads, lists, searches, modifies or deletes the user's
> mail, and requests no scope that would allow it. The step shows "Sends a real
> email when the workflow runs", and Settings shows the connection, how many
> messages were sent this minute and today, and a Disconnect button that revokes
> the grant at Google.

---

## 4. Demo-video script (operator records; unlisted)

1. Signed out, open `https://<CANONICAL_HOST>/`. Show the homepage, then the
   Privacy and Terms links.
2. Sign in with Google (an admitted account).
3. Open **Settings** → Gmail card → **Connect Gmail**.
4. On Google's consent screen, pause so the **client ID in the address bar** and
   the requested permission ("Send email on your behalf") are readable. Allow.
5. Back on Settings: the card shows connected, with "Send emails" as the only
   capability.
6. Dashboard → new workflow → **Input** → **Gmail** (Send Email — point out it is
   the only action) → connect them. Recipient = the same account's own address.
   Point out the "Sends a real email" line.
7. **Run**. Show the step succeed and the run in History.
8. Open that mailbox; show the received message and its `From`.
9. Settings → **Disconnect** → confirm. Then show myaccount.google.com →
   Security → Third-party connections: WfloAI is gone.

---

## 5. What users see on failure (for the reviewer narrative and Task 16)

| Situation | Surface |
|---|---|
| Consent cancelled, or any callback failure | `/settings?gmail=error` → "Connecting Gmail didn't complete — please try again." No row written |
| `invalid_grant` on refresh (revoked at Google, expired) | Row → `requires_reconnect`; the card shows an amber "This connection expired — reconnect to keep Gmail nodes running" and a **Reconnect Gmail** button; Send fails fast with no refresh retry loop |
| Missing scope for an action | Step error naming the missing permission; with the flag off, restricted actions are refused before any token is touched |
| `?tier=read` while the flag is off | 403 "Email reading is not available in this version." |

---

## 6. Post-deploy verification (operator performs; agent verifies what it can)

From Task 14 § Verification — each needs a dated record:

- [ ] Console scope list: `gmail.send` (+ `openid`/`email` if option A), no Restricted
- [ ] Consent screen published; branding matches the product
- [ ] Authorized domain verified = `<CANONICAL_HOST>`
- [ ] Exactly one Gmail redirect URI, the canonical callback
- [ ] Privacy/terms URLs live and banner-free
- [ ] **A fresh non-test account connects** in production
- [ ] That account sends to **its own** address; `From` is that account
- [ ] Its `gmail_connections.scopes` holds no Restricted scope (agent can check read-only)
- [ ] Disconnect → grant gone from the Google permissions page
- [ ] Reconnect → clean connected state
- [ ] Refresh after access-token expiry works unattended
- [ ] Revoke at Google → `requires_reconnect`, clear message
- [ ] Denied consent → `/settings` error message, no row
- [ ] `GMAIL_READ_ACTIONS_ENABLED=false` in the production env; dropdown shows Send only
