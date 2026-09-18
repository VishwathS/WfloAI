# Objective

Make the V1 Gmail integration usable by **real admitted WfloAI users**, not only by developer and test Google accounts.

Entry state: `PRODUCTION READY` (Task 13). Exit contribution: Gmail is connectable by an eligible non-developer user, which Task 15 then certifies end-to-end.

### The V1 scope decision — do not widen it

**V1 Gmail is Send Email only, on `gmail.send` alone.**

This is not a preference; it is the existing product decision recorded in **A15** and **D1** and carried through Tasks 01 and 10:

| Scope | Google classification | V1 |
|---|---|---|
| `gmail.send` | **Sensitive** | **Yes** — the only scope V1 requests |
| `gmail.compose` | **Restricted** | No — removed from the initial tier by Task 01 / A15 |
| `gmail.readonly` | **Restricted** | No — gated off by `GMAIL_READ_ACTIONS_ENABLED=false` |

Everything a Restricted scope unlocks — **Create Draft**, Find Emails, Read Email, Reply to Email — stays deferred with the full D1 program (CASA security assessment, Letter of Assessment, annual re-assessment, the four Limited Use requirements) in MASTER §6. Nothing in this task may pull any of it forward. If completing this task appears to require a Restricted scope, that is a signal the scope crept — stop, do not expand.

The practical stakes: a Sensitive-scope submission is a verification review measured in days. A Restricted-scope submission adds a third-party security assessment measured in weeks with recurring cost. Accidentally requesting one Restricted scope moves the whole integration across that line.

# Audit Items

**LAUNCH-14** — a launch-extension ID, not an original audit ID.

Executes the Google half of **B6** (superseding Task 11's `# Manual / External Steps` items 12–19) and closes the external half of **A15**. Consumes **D1**'s V1 position (flag off) without advancing D1's deferred program.

**Prerequisites:**
- **Task 01 (A15) must have landed.** If `lib/gmail/scopes.ts` still requests `gmail.compose` at initial connect, this task's entire premise is wrong and the submission would be a Restricted-scope submission.
- **Task 13 must have decided the canonical origin.** Redirect URIs are exact-match; registering the wrong origin means Gmail connect fails for every user.
- **Task 07** must have published the privacy policy and terms at stable URLs — Google's OAuth configuration requires them, and Trust & Safety reads the policy against the declared scopes.
- **Task 10**'s `GMAIL_READ_ACTIONS_ENABLED=false` verified in production.

# Current State

### The scope map as the repository has it today

`lib/gmail/scopes.ts` is the single scope↔action map, and as of this writing it still requests a Restricted scope at connect:

```ts
export function scopesForTier(tier: GmailTier): string[] {
  return tier === "read"
    ? [GMAIL_SCOPES.send, GMAIL_SCOPES.compose, GMAIL_SCOPES.readonly]
    : [GMAIL_SCOPES.send, GMAIL_SCOPES.compose];
}
```

The file's own comment asserts *"send/compose are 'sensitive' scopes"* — the same incorrect claim A15 found in CLAUDE.md. **`gmail.compose` is Restricted.** Task 01 corrects both the code and the comment. Re-read this file before doing anything in this task and confirm the correction landed; if the comment still says "send/compose are sensitive", treat the code as unverified too.

`.env.local.example` carries the same stale premise:

> *"Send and Create Draft need only sensitive scopes and remain available either way."*

That line is wrong for Create Draft and should have been corrected by Task 01. Its state is a quick tell for whether A15 was done properly or only partially.

### Per-action scope requirements as built

```ts
requiredScopesForAction(action):
  "Send Email"     → [gmail.send]
  "Create Draft"   → [gmail.compose]                    // Restricted → not V1
  "Reply to Email" → [gmail.send, gmail.readonly]       // Restricted → not V1
  "Find Emails"    → [gmail.readonly]                   // Restricted → not V1
  "Read Email"     → [gmail.readonly]                   // Restricted → not V1
```

So **Send Email is the only action reachable on `gmail.send` alone**, which is what makes a Send-only V1 coherent rather than arbitrary.

`gmailReadActionsEnabled()` reads `process.env.GMAIL_READ_ACTIONS_ENABLED === "true"` and defaults **off**, so an unconfigured deploy never exposes an unverified Restricted scope. `isReadAction()` covers Find / Read / Reply — note it does **not** cover Create Draft, which is why A15's separate gating of Create Draft (Task 01) matters and must be confirmed rather than assumed.

### Redirect URI is computed per-request from the incoming origin

```
app/api/integrations/gmail/connect/route.ts:26
  const redirectUri = `${requestUrl.origin}/api/integrations/gmail/callback`;

app/api/integrations/gmail/callback/route.ts:70
  redirectUri: `${requestUrl.origin}/api/integrations/gmail/callback`,
```

There is no pinned site-URL variable. Google matches redirect URIs **exactly**, so:

- Only the canonical production origin's callback URL will work.
- **Preview deployments cannot complete Gmail OAuth**, because each has a distinct origin that is not registered. This is expected, not a bug — but it must be stated, or the first person to test Gmail on a preview URL will file it as one.
- Apex and `www` are different origins. Register the canonical one and make the other redirect to it (Task 13).

The callback returns the user to `/settings?gmail=<result>` on the same origin (`callback/route.ts:25`), so the settings page is the surface where every connect outcome lands.

### Token lifecycle already implemented — verify it, don't rebuild it

`lib/gmail/client.ts` handles: encrypted access-token cache, refresh with optimistic compare-and-swap on `access_token_expires_at` so concurrent refreshes make one Google call, and `invalid_grant` → `status='requires_reconnect'` (fail fast rather than hammering refresh). `lib/gmail/oauth.ts` holds the revocation function used by disconnect and reused by Task 09's account deletion.

`gmail_connections.scopes` stores **what Google actually granted**, not what was requested. That distinction is the basis of this task's most important verification: a user who consents to a narrower set than requested is recorded accurately, and actions requiring an ungranted scope must fail cleanly rather than at the Google API boundary.

### The consent-screen publishing state is not knowable from the repository

Whether the OAuth app is in Testing or Production mode, which scopes the Console lists, and whether verification has been submitted are **all external state**. Nothing in the repo records them, and this document is not evidence of them. Verify in the Console.

# Required Changes

## 1. Autonomous — repository-side preparation

- [ ] **Re-read `lib/gmail/scopes.ts` and confirm A15 landed**: the send tier requests `[gmail.send]` only, Create Draft is gated alongside the read actions, and the file's "send/compose are sensitive" comment is corrected. If any part is missing, **stop** — this task cannot proceed on an unverified premise.
- [ ] **Correct the stale `.env.local.example` comment** if Task 01 missed it (the "Send and Create Draft need only sensitive scopes" line). Small, but it is a load-bearing factual claim about scope tiers.
- [ ] **Produce the scope-justification source material** for the Console submission: for `gmail.send`, which user-facing feature uses it, why a narrower scope does not suffice, and where in the UI the user sees the effect. Derive it from `lib/gmail/actions.ts` and `components/canvas/nodes/GmailNode.tsx` — not from a template. Google rejects generic justifications.
- [ ] **Write the demo-video script** covering the exact flow a reviewer needs to see: signed-out user → sign in → Settings → Connect Gmail → Google consent screen with the OAuth client ID visible in the address bar → returned to Settings showing connected state → a workflow with a Gmail Send node → run → email received. The agent writes the script; the human records it.
- [ ] **Document the reconnect and error surfaces** the operator must check in the Console-facing narrative: what a user sees when `status='requires_reconnect'`, when a scope is missing, and when consent is denied.
- [ ] **Verify the ineligible-action guard has a test.** With `GMAIL_READ_ACTIONS_ENABLED=false`, a graph containing Find/Read/Reply must fail in the **executor**, not only be hidden in the dropdown — a graph's JSONB is user-writable, so a crafted graph bypasses the UI. Task 10 owns this test; confirm it exists and covers both halves. If it does not, record the gap in Task 10 rather than writing it here.
- [ ] **Confirm Create Draft is unreachable** after A15 — absent from the action dropdown **and** rejected by the executor. Same both-halves reasoning.

## 2. Manual / external — human only

Every Google Cloud action. Enumerated in `# Manual / External Steps`. The agent documents; it does not perform, and it does not submit.

## 3. Post-action verification

The decisive one: **a Google account that is not yours and has never been a test user connects Gmail successfully in production and sends an email through a workflow.** Until that has happened, the integration is not proven usable by real users — only by accounts with special status.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] A test asserts `scopesForTier("send")` returns **exactly** `[gmail.send]` — no `gmail.compose`, no `gmail.readonly`. This is the regression guard for A15; without it, a future edit silently re-crosses the Restricted line.
- [ ] A test asserts that with `GMAIL_READ_ACTIONS_ENABLED=false`, every Restricted-scope action (Create Draft, Find, Read, Reply) is rejected by the executor even when injected directly into a graph.

**Manual — Console and production**

- [ ] **Console scope list shows `gmail.send` and no Restricted scope.** APIs & Services → OAuth consent screen → Data access. This is the authoritative check. Code is not evidence, and neither is this document.
- [ ] Consent screen is **Published** (not Testing) with app name, logo, and support email that **exactly match** what users see in the product. Branding mismatch is the most common rejection trigger.
- [ ] The authorized domain is verified and matches the canonical production origin from Task 13.
- [ ] Authorized redirect URIs contain exactly `https://<canonical-origin>/api/integrations/gmail/callback` — and confirm a preview-deployment origin is **not** registered.
- [ ] Privacy policy and terms URLs in the OAuth configuration resolve to the live Task 07 pages, and those pages no longer carry the `DRAFT — NOT REVIEWED BY COUNSEL` banner. A published policy with a draft banner is a rejection risk and a credibility problem.
- [ ] **Fresh-user connect test.** A Google account that is not the developer account, not a Console test user, and has never connected before: sign in to production → Settings → Connect Gmail → consent → returns connected. This is the test that distinguishes "works for me" from "works".
- [ ] **Send test from that fresh account**, to that same account's own address. Confirm delivery and confirm the `From` is that user's address, not the developer's.
- [ ] **Scope check after connect:** the `gmail_connections.scopes` row for that user records `gmail.send` and nothing Restricted.
- [ ] **Disconnect test:** disconnect from Settings, then confirm the grant is gone from that account's Google permissions page (myaccount.google.com → Data & privacy → Third-party apps). Deleting the row is not revocation; this is the check that proves revocation ran.
- [ ] **Reconnect test:** reconnect after disconnecting and confirm a clean connected state with no stale token reuse.
- [ ] **Refresh test:** leave a connection idle past access-token expiry, then run a Send. It must refresh transparently. This is the one that only fails in production, hours after anyone is watching.
- [ ] **Revoke-at-Google test:** revoke the grant from the Google account's own permissions page (not from WfloAI), then run a Send. Expect `status='requires_reconnect'` and a clear user-facing message — not a retry loop, and not a raw Google error string.
- [ ] **Denied-consent test:** start connect and click Cancel on the consent screen. Confirm the user lands on `/settings` with a comprehensible message and no partial connection row.
- [ ] Confirm `GMAIL_READ_ACTIONS_ENABLED=false` in the **production** environment, then confirm Find/Read/Reply/Create Draft are absent from the node's action dropdown in production.

# Stop Conditions

Stop and ask before proceeding if:

- **Submitting anything to Google OAuth verification is the next action.** Hard stop under MASTER §7.1 — human only, always.
- **Any Google Cloud production setting would be modified** — consent screen, scopes, redirect URIs, branding, test users, publishing status. Hard stop. The agent never touches the Console.
- **Any Restricted scope would be added, requested, or justified** — `gmail.compose`, `gmail.readonly`, or any other. Hard stop under MASTER §7.1 ("enabling Gmail restricted/read scopes"). This includes adding one "just so Create Draft works in V1": that is the deferred D1 program, and pulling it forward changes a days-long review into a weeks-long assessment with recurring cost.
- **Task 01's A15 change has not landed**, or `lib/gmail/scopes.ts` still requests `gmail.compose` at connect. The whole premise fails. Do not proceed and do not "just verify anyway".
- **Any test would send email to an address that is not the tester's own.** Hard stop — sending real email during testing is on the global list, and the fresh-account test is explicitly limited to that account sending to itself.
- Existing connected accounts would need tokens **revoked, rotated, or re-consented** to accommodate the scope change. That changes what already-connected users hold, and it is the operator's decision.
- Google's review comes back requesting changes that alter product behavior, scope set, or legal text. Bring the response back rather than implementing it — a reviewer's suggestion is not automatically the right product decision, and legal text changes are their own hard stop.
- Anyone proposes that verification "has been approved" without the approval visible in the Console. Do not record approval that has not happened.

# Completion Criteria

- `scopesForTier("send")` returns exactly `[gmail.send]`, covered by a regression test.
- Create Draft, Find, Read, and Reply are unreachable in production — dropdown and executor both, covered by tests.
- Console shows `gmail.send` and **no Restricted scope**, verified in the Console UI by a human.
- Consent screen published, branding matching the product, authorized domain verified, redirect URI exactly matching the canonical production callback.
- Privacy policy and terms URLs live, banner-free, and registered in the OAuth configuration.
- **A fresh eligible Google account — not the developer's, not a Console test user — connected Gmail in production and sent an email to its own address.** This is the completion criterion that cannot be substituted.
- Disconnect, reconnect, refresh, external-revoke, and denied-consent all verified with the recorded outcome of each.
- Verification **submitted** — and its status recorded as submitted. **Approval is recorded only when the Console shows it.** Do not claim Google approval that has not occurred; do not treat a submission receipt as approval.
- All three verification commands green; `git diff` reviewed.
- Every Console action recorded in `RELEASE_PROGRESS.md` under Manual Actions with a date.

Gmail restricted-scope work remains **deferred** at the end of this task. Nothing here advances D1.

# Manual / External Steps

Operator-only. The agent documents; it does not perform.

1. **Create or confirm the production Google Cloud project**, separate from development. Enable the Gmail API on it.
2. **Create the production OAuth client** and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the production host environment (Task 13). These are distinct from the Supabase login provider's credentials — WfloAI's Gmail integration uses its own Google OAuth client with PKCE.
3. **Configure the consent screen**: app name, logo, and support email exactly as users see them in the product. Add the developer contact email.
4. **Verify the authorized domain** in Search Console, matching Task 13's canonical origin.
5. **Add the authorized redirect URI**: `https://<canonical-origin>/api/integrations/gmail/callback`. Exactly one. Do not add preview-deployment origins.
6. **Add the scope `gmail.send` and nothing else.** Confirm the Console does not mark any listed scope as Restricted. If it does, stop — something other than A15's intent is configured.
7. **Add the privacy policy and terms URLs** from Task 07's published pages.
8. **Record the demo video** (unlisted) from the agent-written script, with the OAuth client ID visible in the address bar during consent.
9. **Submit for Sensitive-scope verification.** Expect roughly ten days, longer with back-and-forth. Record the submission date.
10. **Publish the consent screen** (move out of Testing) at the point the verification flow requires it, so real users are no longer capped by the unverified-app user limit.
11. **Run the fresh-account connect and send test** from an account with no test-user status.
12. **Check the Google permissions page** after the disconnect test — the app cannot verify this for you.
13. **Do not pursue Restricted scopes.** Create Draft, Find, Read, and Reply remain deferred with the full D1 program in MASTER §6. Revisit only after Phase 3, weighing the CASA security assessment, Letter of Assessment, annual re-assessment, and recurring cost.
