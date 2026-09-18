# WfloAI — Google OAuth production (Task 14)

Operator material for releasing Gmail Send to real admitted users. The agent
prepared this; **every Google Cloud action is the operator's**, and nothing here
has been changed in any Console. `<CANONICAL_HOST>` is decided in
[DEPLOYMENT.md](DEPLOYMENT.md) §1 and is not chosen yet.

**V1 Gmail is Send Email on `gmail.send` only** (the connect also requests the
non-sensitive `openid` and `email`, for the connected address — see §0).
`gmail.compose` and
`gmail.readonly` are Restricted and stay deferred with D1. Nothing here requests,
adds or justifies either.

---

## 0. Resolved 2026-09-17 — a fresh send-only connect could not complete

**Was CRITICAL for Task 14. Fixed in code by operator-approved option A; not yet
deployed or proven against real Google.**

The callback used to read the connected address from Gmail's
`GET /gmail/v1/users/me/profile`. Google authorizes `users.getProfile` only for
`mail.google.com`, `gmail.modify`, `gmail.compose`, `gmail.readonly` and
`gmail.metadata` — **not `gmail.send`**. After A15 removed `gmail.compose`, every
fresh connect got a 403 there and landed on "Connecting Gmail didn't complete".
It stayed hidden because the only live connection predates A15 and still holds
`gmail.compose`.

**Fix (option A, approved by the operator):**

- The send tier requests exactly **`openid email https://www.googleapis.com/auth/gmail.send`**
  (`scopesForTier` in `lib/gmail/scopes.ts`, via `IDENTITY_SCOPES`). `openid` and
  `email` are **non-sensitive** identity scopes and do not change the
  verification class. `gmail.send` is still the only Gmail scope and Send is still
  the only Gmail capability.
- The callback reads the address from Google's OIDC userinfo endpoint,
  `GET https://openidconnect.googleapis.com/v1/userinfo`, with the new access
  token (`fetchGoogleAccountEmail` in `lib/gmail/oauth.ts`). It refuses a missing
  or non-string `email` and an explicit `email_verified: false`; any failure
  persists nothing and lands on `/settings?gmail=error`.
- Unchanged: PKCE (S256), the sealed user-bound single-use state cookie,
  server-only token handling, encrypted refresh-token storage, disconnect and
  revocation, Send, quotas, idempotency, unattended-send consent, and the 403 on
  `?tier=read` while `GMAIL_READ_ACTIONS_ENABLED` is off.
- Tests: `tests/gmailConnectScope.test.ts` (exact scope set, no Restricted scope,
  PKCE/state/cookie preserved, read tier refused) and `tests/gmailCallback.test.ts`
  (userinfo success persists the connection and never calls
  `gmail.googleapis.com`; userinfo 401 / no email / unverified / non-string email
  persist nothing; state mismatch and cross-user state call no Google endpoint;
  no token appears in redirects, reports or audit records; the state cookie is
  cleared on every outcome). The success test was RED before the fix.

**Still unproven:** the fix is verified against a stubbed Google, not the real
one. The decisive check — a fresh non-test Google account connects in
production and sends to its own address — is Task 14's operator verification,
after deployment.

### Existing connection with a Restricted scope

Re-read 2026-09-17 (read-only): still the only row, `active`, with a refresh
token, scopes `openid`, `userinfo.email`, `userinfo.profile`, `gmail.send`,
`gmail.compose`. **Legacy state, left untouched.** It stays compatible with the
new code — Send checks for `gmail.send` only, and refresh does not depend on
scopes — and its `gmail.compose` cannot be used while the flag is off. It still
fails Task 14's "`gmail_connections.scopes` records nothing Restricted" check.
Changing what an already-connected user holds is the operator's decision (Task 14
Stop Condition). Note that `upsertGmailConnection` **merges** stored scopes, so
simply reconnecting would keep `gmail.compose` on the row. The clean path, after
the fix is deployed: that user **disconnects** in Settings (which revokes the
whole grant at Google and deletes the row), then reconnects.

### The Gmail client may not be separate from the login client

The same row also holds `openid`, `userinfo.email` and `userinfo.profile`, which
no version of the Gmail connect code has requested. They arrived through
`include_granted_scopes=true`, which merges grants the user had already given.
That suggests the Gmail OAuth client shares a client or Google Cloud project with
the Supabase Google **login** provider, while CLAUDE.md describes them as
separate. **Confirm in the Console**: compare the client ID under Supabase → Auth →
Providers → Google with `GOOGLE_CLIENT_ID`. If they share a project, they share
one consent screen, one publishing state and one verification.

What the repository can and cannot show (re-checked 2026-09-17):

- The Gmail flow uses only `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  (`lib/gmail/oauth.ts` `getGoogleClientConfig`). The login flow never touches
  them: `components/auth/login-card.tsx` goes through Supabase's Google
  provider, whose client ID lives only in the Supabase dashboard. **The code
  keeps them separable; it cannot prove they are separate** — that is a Console
  fact.
- Since `fee570c` the Gmail connect itself requests `openid` and `email`, so a
  new row holding those no longer indicates anything. `userinfo.profile` still
  does: the Gmail code has never requested it, while Supabase's Google login
  does. A new connection row that holds `userinfo.profile` means the two flows
  share an OAuth client.
- Recommended target (operator decision, Console-only): a dedicated Gmail
  integration client whose consent screen lists `gmail.send`, `openid` and
  `userinfo.email`, and a login client that never lists a Gmail scope.
  **`GOOGLE_CLIENT_SEPARATION_OPERATOR_CHECK`.**

---

## 1. Repository state verified (2026-09-17)

| Check | Result | Evidence |
|---|---|---|
| Send tier requests exactly `openid email gmail.send` (the only Gmail scope is `gmail.send`) | Yes (2026-09-17) | `lib/gmail/scopes.ts`; regression test `tests/gmailConnectScope.test.ts` |
| Connected address read from OIDC userinfo, not `users.getProfile` | Yes (2026-09-17) | `lib/gmail/oauth.ts`; `tests/gmailCallback.test.ts` |
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
11. `https://www.googleapis.com/auth/gmail.send`, plus the non-sensitive
    `openid` and `.../auth/userinfo.email` (§0 option A — shipped in code).
12. **Confirm the Console marks no listed scope as Restricted.** If it does, stop.

### H. Domain and verification
13. Search Console: verify `<CANONICAL_HOST>`; add it under Branding →
    Authorized domains. `<CANONICAL_HOST>` is the Vercel production alias for V1
    (DEPLOYMENT.md §1). **`GOOGLE_CUSTOM_DOMAIN_MAY_BE_REQUIRED`:** if Google
    will not accept a `*.vercel.app` host as a verified authorized domain for
    sensitive-scope verification, a custom domain becomes a Task 14 operator
    gate — buy/attach it, make it canonical, and re-register every URL in
    DEPLOYMENT.md §1. It does not block the first deployment, and Testing-mode
    use by listed test users does not need it.
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

- [ ] Console scope list: `gmail.send` + `openid` + `userinfo.email`, no Restricted
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
