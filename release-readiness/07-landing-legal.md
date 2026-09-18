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

- [x] **Public homepage** at `/`, accessible without authentication. This requires coordinating with task 01's middleware allow-list — the two tasks must agree on which paths are public, or the homepage will be gated and the OAuth submission will fail.
- [x] Move the authenticated dashboard to its own path, or serve the marketing page at `/` and the dashboard at `/` only when authenticated. Pick one and be explicit; do not leave the routing ambiguous.
- [x] **`/privacy`** — publicly accessible, on the same domain. Must enumerate: Google data accessed; the Gmail scopes actually requested (after task 01's A15 change this is `gmail.send` only) and the **Limited Use** commitment; workflow content; uploaded files; run outputs; **subprocessors** (Anthropic, Tavily, Supabase, the deployment host, Inngest, Google, and the error reporter added in task 02); retention periods; deletion rights; contact information.
- [x] **`/terms` + AUP** — must explicitly prohibit spam and unsolicited commercial email, credential abuse, open-proxy use of the HTTP node, and scraping; and must reserve the right to suspend accounts.
- [x] **Consent line at login** in `components/auth/login-card.tsx` linking to both documents.
- [x] **B1** — name Anthropic and Tavily as subprocessors with accurate statements only.
- [x] **B1** — add the AI-disclosure line to the ToS and an AI-generated-content note in the product.
- [x] Retention periods stated in the policy must match what task 12 (B2) actually implements. If task 12 has not landed, state the intended periods and flag the dependency — **do not state a period you do not honor.**
- [x] Every generated legal page must carry, as its first rendered content:
  ```
  > **DRAFT — NOT REVIEWED BY COUNSEL.** Do not publish without human legal review.
  ```

# Implementation record (2026-09-16)

## Routing: marketing at `/`, dashboard at `/dashboard`

The task offers two shapes and says to pick one and be explicit. Picked: **`/` is always the public marketing page**, and the authenticated dashboard moved to `/dashboard`. The alternative — serving different content at `/` depending on session — would have made the homepage dynamic and session-dependent, which is exactly the property Google's requirement (*"publicly accessible, not login-restricted"*) is checking for. `/`, `/privacy` and `/terms` now build as **static** routes; only `/dashboard` and the rest are dynamic.

`app/(dashboard)/page.tsx` moved to `app/(dashboard)/dashboard/page.tsx` with `git mv`, and a new `app/(marketing)/` route group holds the three public pages plus their own header/footer shell.

Everything that pointed at the dashboard by its old address was repointed: the sidebar nav and its `#templates` anchor, the canvas "Back to dashboard" link, the `LoginCard` default, and `safeRedirectPath`'s `DEFAULT_PATH` — which matters, because that is where a login with no `next` parameter lands. `tests/safeRedirect.test.ts` was updated with it; the hostile-input cases still assert the same thing, that every rejected candidate resolves back to this origin.

A signed-in visitor to `/` sees the marketing page with a **Sign in** button rather than a "Go to dashboard" one. That is deliberate rather than overlooked: making the header session-aware would cost the static homepage. The flow still works — the proxy already redirects a signed-in user from `/login` to `/dashboard`, so the button lands them on the dashboard. **Whether that reads as broken is a Task 16 judgement**, and it is recorded as HUMAN_UI_CHECK_REQUIRED.

## The task 01 collision, and how it is now caught

The task warns that this work must agree with task 01's allow-list *"or the homepage will be gated and the OAuth submission will fail"*. Rather than editing the list in place and hoping, the policy moved to **`lib/security/publicPaths.ts`**, exporting `requiresAuth(pathname)` with task 01's comments carried over verbatim. `proxy.ts` now imports it and is down to the session refresh and the two redirects.

That makes the collision testable. `tests/publicPaths.test.ts` asserts `/`, `/privacy`, `/terms`, `/login` and `/auth/callback` are public; `/dashboard`, `/settings` and `/workflows/:id` are gated; `/api/*` and `/_next/*` pass through untouched; and — the part that matters for A4 — an unrecognised path is gated **by default**, so the allow-list cannot silently decay into the deny-list it replaced. It also pins that a path merely *starting with* a public one (`/privacy-policy-archive`) stays gated.

**The literal verification checkbox stays unticked.** It asks for a test that the three pages return **200** unauthenticated, and this repository has no HTTP harness (MASTER section 7.7 puts building one out of bounds). The assertion is made one level down, against the predicate the proxy actually consults, which is where the collision would live. The 200s themselves are the private-window check in the manual list.

## What the privacy policy says, and what it refuses to say

Written against the data inventory in this task file rather than from a template, and checked back against the code. It describes the seven storage categories, the six services that receive data, and — the item the task warns is easiest to forget — **a section of its own for the HTTP Request step**, which sends whatever you configure to whatever address you configure, using your credential, to a destination the policy cannot describe.

Four things it deliberately does **not** claim:

- **No zero-retention agreement with Anthropic.** It states what the commercial terms provide (no training on API customer content; inputs and outputs deleted within 30 days absent a longer-retention feature) and then says explicitly that no ZDR agreement has been negotiated and none is claimed.
- **No retention period for run history or integration records.** They are currently kept indefinitely, task 12 has not landed, and the task is unambiguous — *"do not state a period you do not honor"*. The page carries a visible **Pending** callout saying so, and that a period must be committed to and implemented before publication.
- **No self-service account deletion.** That is task 09 and does not exist yet, so the page says deletion is requested at the contact address and done manually. A second **Pending** callout. Task 09 should replace both sentences.
- **No error-monitoring subprocessor.** Task 02's reporter facade exists with **no transport registered**, so no external error service receives anything today. Naming a vendor here would be naming a fictional subprocessor, which the Completion Criteria forbid. The page states the current fact and commits to naming one before it is turned on. **This is what previously looked like a task 02 blocker on task 07, and it is not one** — the dependency runs the other way: whoever registers a transport must update this page first.

The hosting provider is named as a category rather than a company because it is chosen at task 13. That is flagged in the outstanding list below, not papered over.

The Gmail section states the single requested permission (`gmail.send`), states plainly that it does not permit reading the mailbox, listing messages or creating drafts, and carries the **Limited Use** paragraph. It also discloses that Gmail message and thread identifiers are recorded for duplicate-send protection, and that they never reach the interface or an AI step — which is true, and is a CLAUDE.md invariant.

## Terms and AUP

All four prohibitions the task names are present and specific: spam and unsolicited commercial email; credential abuse; open-proxy use of the HTTP Request step; and scraping in violation of a destination's terms. Six more follow from what the product can actually do — forged sender identity, probing internal addresses, evading usage limits, processing personal data without a lawful basis, unlawful content, and resale. The suspension right is reserved explicitly.

The two product-specific facts the task says no template covers are stated in the opening section rather than buried: a workflow **sends mail as you**, and a workflow **points our servers at third-party services using credentials you supply** — in both cases the action is yours.

**B1 AI disclosure** is a full section of the ToS, not a line: the output can be wrong or fabricated, nothing reviews it before the next step acts on it, and if a workflow sends it somewhere it does so without judging whether it is correct. The task's reading of the Anthropic Usage Policy — cheap to satisfy, not clearly binding — is what this follows.

## In-product AI note

`components/canvas/ExecutionLog.tsx` gained a one-line footer wherever run output is read: *"AI steps write this output. It can be wrong, and nothing reviews it before the next step acts on it."* The scroll area shrinks by the footer's height so the panel's collapsed and expanded heights are unchanged.

## Verification

`npm test` (136 passed, 16 files), `npx tsc --noEmit`, `npm run lint` and `npm run build` are all green. The build output confirms the routing split: `/`, `/privacy` and `/terms` are prerendered static; `/dashboard` is dynamic.

## Outstanding

- **The contact address is a visible placeholder** — `[PRIVACY CONTACT ADDRESS — OPERATOR TO SUPPLY]` on both pages. Manual Step 6, and deliberately not invented. It is the same address task 13's runbook must name; task 17 gate 15 checks they match.
- **The hosting provider is named as a category, not a company.** Task 13 decides it; this page must be updated then.
- **Retention periods** — task 12 must implement them and this page must then state them.
- **Self-service account deletion** — task 09 must land and this page must then describe it.
- **The error reporter** — task 02 must name a vendor, and this page must list it *before* the transport is registered.
- **Counsel review, and banner removal** (Manual Steps 1 and 2). Both legal pages carry the DRAFT banner as their first rendered content. **Removing it is a MASTER section 7.1 hard stop for an agent.**
- **The private-window check and the domain check** (the first two Manual verification lines) need a deployed origin — HUMAN_UI_CHECK_REQUIRED, and partly task 13.
- **Whether the marketing page reads correctly to a signed-in visitor** — Task 16.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
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
6. **Provide a real contact address** for privacy inquiries. The policy needs one that is monitored. **This is the same address Task 13's `docs/RUNBOOK.md` names as the support/incident route** — one monitored address, published here and routed there, not two. Task 17's Gate 15 checks that they match.

### Update 2026-09-17 (release resume) — contact address and Gmail scope sentence

- **Contact:** the operator chose `vishwath@ucsb.edu`. It is one constant, `SUPPORT_EMAIL` in `lib/support.ts`, rendered as a `mailto:` link in the privacy policy's and terms' Contact sections and in a new `/help#contact` section; `docs/RUNBOOK.md` §2.1 names it; `tests/supportContact.test.ts` fails on any drift or a returning placeholder. Blocking item (2) above — a real monitored contact address — is now **supplied**; that it is actually monitored is Task 17 Gate 15's check.
- **Factual correction in the privacy draft:** after `fee570c` the Gmail connect requests `openid` and `email` alongside `gmail.send`, so "requests one permission: gmail.send" was false. The sentence now names all three and states that they cannot read, list or draft mail. **This is a changed legal statement — counsel review must cover it.** Both "Last updated" dates moved to 17 September 2026.
- Nothing else changed. **Both DRAFT — NOT REVIEWED BY COUNSEL banners remain.** No company entity, address, jurisdiction, compliance claim or counsel approval was added.
