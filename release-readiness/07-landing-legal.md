# Objective

Give WfloAI a public face and the legal documents that Google OAuth verification requires and that users are entitled to. Today `/` redirects to `/login`, so there is no publicly accessible homepage at all — which by itself blocks the OAuth submission.

**Every document produced by this task is a draft for human review.** See `# Stop Conditions`.

# Audit Items

**A1** (no Privacy Policy, Terms, or public homepage) · **B1** (provider disclosures)

⚖️ This task involves legal content. The agent drafts; a human — and for the Google submission, ideally counsel — reviews.

# Current State

There is no `/privacy`, no `/terms`, and no landing page. Grepping for policy language returns zero hits outside template prompt text.

The application has exactly four pages: login, dashboard, settings, and the workflow canvas. `/` is the auth-gated dashboard, and `middleware.ts:17` redirects unauthenticated visitors to `/login`. There is no consent line at login (`components/auth/login-card.tsx`).

### Why this gates the Google submission

Google requires the privacy policy to be *"visible to users, hosted within the same domain as your application's home page"* and to disclose how the app *"accesses, uses, stores, or shares Google user data."* The API Services User Data Policy requires publishing it and listing the URL in the OAuth configuration. The homepage must be **publicly accessible, not login-restricted**.

### What the policy actually has to cover — this is not a template job

WfloAI's data flows are unusual and a generic SaaS template will not describe them:

| Category | Detail |
|---|---|
| Stored per user | Google identity; workflows + graph JSONB (prompts, URLs, headers, recipient addresses); `workflow_runs` (every node's output text, currently unbounded retention); `workflow_files` (≤200k chars extracted text + raw bytes in Storage); `gmail_connections` (encrypted tokens, granted scopes, connected address); `user_credentials` (encrypted third-party keys); `integration_action_executions`; `integration_audit_events` |
| Sent to third parties | Prompts + upstream context → Anthropic; queries → Tavily; message bodies + recipients → Google; **arbitrary payloads → arbitrary hosts** via the HTTP node |

The ToS/AUP must do product-specific work no template covers: **users point the operator's infrastructure at arbitrary third-party APIs using their own credentials, and send mail as themselves.**

### B1 — what can accurately be said about providers

Anthropic's Commercial Terms provide that it **does not train on commercial API customer content**, and API inputs/outputs are **deleted within 30 days** absent a negotiated zero-retention agreement or a longer-retention feature. **Do not claim ZDR** unless one has actually been negotiated.

On AI disclosure: Anthropic's Usage Policy contains "disclose at the beginning of each session" language in two places — once scoped to High-Risk Use Cases (legal, healthcare, insurance, financial, employment, housing, academic, journalism), none of which WfloAI clearly is, and once for *"All consumer-facing chatbots, including any external-facing or interactive AI agent."* WfloAI is arguably the latter but is not a chatbot, and its users plainly know they are using an AI tool. **Treat this as cheap to satisfy rather than clearly binding** — a line in the ToS plus an AI-generated-content note discharges it under either reading at negligible cost.

# Required Changes

- [ ] **Public homepage** at `/`, accessible without authentication. This requires coordinating with task 01's middleware allow-list — the two tasks must agree on which paths are public, or the homepage will be gated and the OAuth submission will fail.
- [ ] Move the authenticated dashboard to its own path, or serve the marketing page at `/` and the dashboard at `/` only when authenticated. Pick one and be explicit; do not leave the routing ambiguous.
- [ ] **`/privacy`** — publicly accessible, on the same domain. Must enumerate: Google data accessed; the Gmail scopes actually requested (after task 01's A15 change this is `gmail.send` only) and the **Limited Use** commitment; workflow content; uploaded files; run outputs; **subprocessors** (Anthropic, Tavily, Supabase, the deployment host, Inngest, Google, and the error reporter added in task 02); retention periods; deletion rights; contact information.
- [ ] **`/terms` + AUP** — must explicitly prohibit spam and unsolicited commercial email, credential abuse, open-proxy use of the HTTP node, and scraping; and must reserve the right to suspend accounts.
- [ ] **Consent line at login** in `components/auth/login-card.tsx` linking to both documents.
- [ ] **B1** — name Anthropic and Tavily as subprocessors with accurate statements only.
- [ ] **B1** — add the AI-disclosure line to the ToS and an AI-generated-content note in the product.
- [ ] Retention periods stated in the policy must match what task 12 (B2) actually implements. If task 12 has not landed, state the intended periods and flag the dependency — **do not state a period you do not honor.**
- [ ] Every generated legal page must carry, as its first rendered content:
  ```
  > **DRAFT — NOT REVIEWED BY COUNSEL.** Do not publish without human legal review.
  ```

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] A test asserting `/`, `/privacy`, and `/terms` return 200 **while unauthenticated**. This is the check that catches the middleware collision with task 01.

**Manual**

- [ ] Load `/`, `/privacy`, `/terms` in a private window. All three must render without a login prompt.
- [ ] Confirm the policy URLs are on the same domain as the homepage — Google requires this specifically.
- [ ] Read the privacy policy against the actual data inventory above and confirm nothing stored is undisclosed. The HTTP node's arbitrary-egress behavior is the easiest thing to forget.
- [ ] Confirm every subprocessor named in the policy matches what the code actually calls, and that none is missing.
- [ ] Confirm the draft banner is present on every legal page before any review, and removed only by a human after review.
- [ ] Confirm the consent line at login links to live, working URLs.

# Stop Conditions

Stop and ask before proceeding if:

- **Any legal claim would need to be invented or materially changed.** Hard stop. Draft only what the audit and the code support.
- The draft would state a retention period, a security guarantee, or a compliance certification not backed by implemented behavior. Promising deletion you do not perform is an FTC Section 5 problem regardless of privacy-law thresholds.
- Publishing the pages, or submitting them to Google, is the next step. Both are hard stops.
- The homepage change conflicts with task 01's middleware allow-list in a way that is not trivially reconcilable.
- Naming a subprocessor requires confirming a vendor's terms you cannot verify from primary sources.
- Drafting the AUP raises a question about what the product actually permits — that is a product decision.

# Completion Criteria

- Public homepage, `/privacy`, and `/terms` all render unauthenticated, verified in a private window.
- Every data category in the inventory above is disclosed.
- Every real subprocessor is named; no fictional one is.
- Anthropic and Tavily statements are accurate and make no ZDR claim.
- AI-disclosure line present in the ToS.
- Consent line at login links to both documents.
- **Draft banner present on every legal page.** The task is complete with the banner in place — removing it is a human action, not part of this task.
- Retention periods either match implemented behavior or are explicitly flagged as pending task 12.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. ⚖️ **Have counsel review the privacy policy and ToS/AUP before publishing** — particularly the Google data-handling section and the Limited Use language. Google Trust & Safety reads the policy against the declared scopes; a mismatch is a rejection.
2. **Remove the draft banner** yourself, after review. The agent must not.
3. **Add the published privacy policy URL** to the Google Cloud OAuth configuration (task 11 / B6).
4. **Verify the domain** in Search Console — required for the OAuth submission.
5. **Decide the retention periods** you are willing to commit to, so task 12 implements what the policy promises rather than the reverse.
6. **Provide a real contact address** for privacy inquiries. The policy needs one that is monitored.
