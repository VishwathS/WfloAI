# Objective

Make sending real email as the user something they authorize deliberately — particularly when the sending is **unattended**, on a schedule, with nobody watching.

Also: keep Gmail read actions off in production for V1, and verify that they are off rather than assuming it.

> **Downstream dependents.** The production-environment checks in this task require the environment established by **Task 13**. The Send-only V1 scope this task assumes is released to real users by **Task 14**, and re-verified in production by **Task 15** (which asserts Create Draft / Find / Read / Reply are unreachable via both the dropdown and a crafted graph). Nothing here advances the deferred D1 restricted-scope program.

# Audit Items

**A14a** (consent for schedule-enabled Gmail sends — blocker) · **B14b** (manual-run confirmation — recommended, Phase 3) · **D1** (flag-off verification only; the full restricted-scope program stays in the backlog)

# Current State

### A14a — no consent step for unattended sending

Enabling a schedule on a send-capable workflow requires **no consent step at all**. The user toggles a schedule and the system will thereafter send real email from their Gmail account, indefinitely, without them present.

Quotas (10 sends/min, 200/day per `lib/integrations/limits.ts`) are **invisible until an error fires**. The first time a user learns a limit exists is when they hit it.

Gmail disconnect has **no confirmation**.

What exists today: `components/canvas/nodes/GmailNode.tsx:336` displays *"Sends a real email when the workflow runs."* That covers **awareness**. It does not cover **authorizing unattended operation** — a different thing, at a different moment, with different consequences.

Why unattended is the case that matters: the user is not there. They cannot notice a mistake, cannot cancel, and cannot see the result until after the mail is gone. Google reviews real UX for sensitive scopes, and CAN-SPAM liability attaches to both *"the company whose product is promoted and the company sending"* — so an explicit authorization record has value beyond politeness.

### B14b — no manual-run confirmation

No modal on manual Run of a graph containing Send or Reply. Re-tiered out of blocker status: the attended case has the user watching, and the node-level warning already covers awareness. This is a product-safety design choice worth **user-testing rather than assuming**.

### D1 — read actions

`GMAIL_READ_ACTIONS_ENABLED` (`lib/gmail/scopes.ts:46`) correctly hides Find/Read/Reply from **both** the dropdown and execution. The flag is the right mechanism and is already implemented.

**But note the A15 correction from task 01:** the flag gates *actions*, not *scopes*. `gmail.compose` is a Restricted scope requested at connect time regardless of the flag. Task 01 removes it. This task assumes that change has landed — if it has not, Create Draft is still in the UI and this task's scope is wrong.

# Required Changes

### Phase 2 — A14a

- [x] Add an explicit consent step when **enabling a schedule** on a graph that contains a send-capable Gmail node. It must state plainly: this will send real email from your connected account, automatically, without you present. Detect send-capability from the graph, reusing the static analysis already in `lib/execution/validate.ts` rather than writing a second graph walker.
- [x] Record the authorization — who consented, when, for which workflow. `integration_audit_events` is the natural home.
- [x] Surface **quota and current usage in Settings** — sends used this minute and today, against the limits. A limit the user cannot see is a limit they will hit by surprise.
- [x] Add a **confirmation to Gmail disconnect**. It silently breaks every workflow depending on it.

### Phase 3 — B14b

- [ ] Modal on first manual Run of a graph containing Send or Reply. **User-test this rather than shipping it on assumption** — the audit's explicit position is that this is a design choice, not a mandate.

### Ongoing — D1

- [ ] Verify `GMAIL_READ_ACTIONS_ENABLED=false` in the production environment. Verify; do not assume.
- [x] Add a test asserting that with the flag off, Find/Read/Reply are absent from the action dropdown **and** rejected by the executor. Both halves — a UI-only check would miss a crafted graph.

# Implementation record (2026-09-16)

## A14a — consent for unattended sending

**One graph walker, not two.** The Stop Condition is explicit that a second graph analysis is a correctness bug waiting to happen, so `containsSendCapableGmailNode()` was added to `lib/execution/validate.ts` — the file that already walks graphs — and `lib/schedule/consent.ts` is a three-line predicate on top of it. Send-capable means **Send Email or Reply to Email**: both put mail in someone's inbox. Create Draft does not send, and is unreachable in V1 anyway under A15.

The detector is typed structurally rather than as a reactflow `Node`, so the schedule routes hand it `graph.nodes` straight from the JSONB with no cast. That column is user-writable, so it is also tested against malformed shapes.

**Both routes are gated, and the gate fires on the transition only.** Creating an already-enabled schedule and turning an existing one on are the same authorisation moment, so `POST /schedules` and `PATCH /schedules/:id` both refuse without `unattended_send_ack: true`, returning a machine-readable `code` alongside the message. Renaming a schedule that is already on is **not** that moment, so `PATCH` checks `body.enabled === true && !result.schedule.enabled` rather than the resulting state — friction belongs on the irreversible action, not on everything.

Absent or false is a refusal. The flag is never allowed to default to consent by omission.

**The authorization is recorded** as `gmail.unattended_send.authorized` in `integration_audit_events`, from both paths, with the schedule id as the resource. That gives who, when, and for which schedule. `recordAuditEvent` is best-effort by design, so a failed audit write cannot turn a successful enable into an error.

**The UI** shows an amber panel in the Workflow Settings sidebar stating that the workflow sends real email from the connected account, automatically, **without you present** — the distinction the task draws between awareness (already covered by the node's "sends a real email when the workflow runs") and authorisation. Confirming retries the exact request with the acknowledgement; cancelling does nothing. It is wired into both the schedule form and the enable/disable toggle, because the toggle has no form to hang an error on.

## A14a — visible quota

`gmailSendUsage()` lives next to `checkGmailSendQuota` in `lib/integrations/limits.ts` and reuses the **same action list and the same counter**, so the number shown in Settings cannot drift from the number that is enforced. The Gmail status endpoint returns it, and the Settings card shows sends this minute and today against both limits, plus the fact that a send crossing a limit stops rather than queueing.

## A14a — disconnect confirmation

Disconnect is now two steps. The confirmation says what actually happens: every workflow with a Gmail step stops working, **including schedules that run without you**, and nothing warns you when one fails to send afterwards. Cancelling leaves the connection alone.

While in that card: the capabilities list said *"Send emails & create drafts"*, which has been untrue since A15 gated Create Draft off. It now says "Send emails".

## D1 — verified off, not assumed

The flag mechanism was already right; what was missing was proof. `tests/gmailConsent.test.ts` now covers **both halves**, as the task requires:

- **The executor half, behaviourally.** For each of Create Draft, Reply, Find and Read, `executeGmailAction` is called directly with a deliberately empty context and rejects with "not available in this version". It never touches the context, because the guard is the first statement in the function — which is the point: a graph crafted straight into the JSONB fails before any quota is consumed, any token is fetched, or any request leaves.
- **The dropdown half, against drift.** `GmailNode.tsx` mirrors `isRestrictedAction` because `scopes.ts` is server-only. The test parses the component's `RESTRICTED_ACTIONS` set and asserts it matches the server predicate for **every** action. A UI-only check would miss a crafted graph; a server-only check would leave an action visible that always fails; a mirror with no test drifts.
- Also pinned: the flag defaults off (an unconfigured deploy exposes nothing, and `"TRUE"` is not `"true"`), and Send is the only unrestricted action — Create Draft is restricted because `gmail.compose` is, not because it reads mail.

**Verifying the flag in the deployed environment is still outstanding** and is Manual Step 1. The task says verify, do not assume, and a test in this repository cannot see the production host's configuration.

## B14b — deferred, which the task permits

No modal on manual Run. The audit re-tiered this out of blocker status, the task says *"user-test this rather than shipping it on assumption"*, and its Completion Criteria accept deferral with the reason recorded. The attended case has the user watching, the node-level warning already covers awareness, and shipping friction on every manual run without testing it is the product regression the Stop Conditions warn about. **Recorded as Phase 3 and as Manual Step 3.**

## What the tests do not cover

*"Enabling a schedule on a send-capable graph without consent is rejected"* and *"the consent event is written to the audit log"* are both HTTP-and-database statements. The **rule** underneath the first is fully unit-tested, and the wiring of both is pinned by source assertions on the two routes, so a future edit cannot quietly drop either. The round trips need a live Postgres and a request cycle, which MASTER section 7.7 puts out of bounds here.

## Outstanding

- **Verify `GMAIL_READ_ACTIONS_ENABLED=false` in the deployed environment** — the host's configuration, not `.env.local` (Manual Step 1). Depends on task 13.
- **Confirm quota usage in Settings matches reality after a test send** — needs a real send, **to your own address only**. Sending real email is a global hard stop for an agent, so nothing was sent.
- **HUMAN_UI_CHECK_REQUIRED:** that the consent panel reads as being about *unattended* operation rather than just about sending; that the disconnect confirmation appears and that cancelling does not disconnect.
- **User-test B14b** before deciding whether to build it (Manual Step 3).
- **Decide whether to pursue the full D1 restricted-scope program** (Manual Step 4) — under A15 it now gates Create Draft as well, and carries a CASA assessment with recurring cost. Nothing here advances it.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [ ] Test: enabling a schedule on a send-capable graph without consent is rejected.
- [x] Test: enabling a schedule on a graph with **no** send-capable node requires no consent — the friction must not apply where it is not warranted.
- [x] Test: with `GMAIL_READ_ACTIONS_ENABLED=false`, a graph containing a Find/Read/Reply node fails execution even if the graph JSONB was crafted directly.
- [ ] Test: the consent event is written to the audit log.

**Manual**

- [ ] Walk the schedule-enable flow on a send-capable workflow and confirm the consent step is clear about *unattended* operation, not just about sending.
- [ ] Confirm quota usage in Settings matches reality after sending a test email.
- [ ] Confirm the disconnect confirmation appears and that cancelling it does not disconnect.
- [ ] Confirm the production environment has the read flag off — check the deployed environment's configuration, not `.env.local`.
- [ ] **All send testing must go to your own address only.** See Stop Conditions.

# Stop Conditions

Stop and ask before proceeding if:

- **Any test would send email to an address that is not your own.** Hard stop. Sending real email during testing is on the global hard-stop list.
- **Enabling Gmail restricted or read scopes** is the next step. Hard stop. That is the full D1 program and it lives in the backlog.
- Task 01's A15 change has not landed. This task's scope depends on it — Create Draft's presence or absence changes what needs a consent step.
- Detecting send-capability requires logic that duplicates `lib/execution/validate.ts`. Reuse rather than fork; a second graph analysis that drifts from the first is a correctness bug waiting to happen.
- The consent UX would meaningfully reduce the usefulness of scheduling for legitimate users. Friction on the irreversible action is the goal; friction on everything is a product regression.
- Submitting anything to Google OAuth verification is the next step. Hard stop.

# Completion Criteria

- Schedule-enable consent implemented, recorded in the audit log, and tested both positively and negatively.
- Quota usage visible in Settings and matching actual usage.
- Disconnect confirmation live.
- `GMAIL_READ_ACTIONS_ENABLED=false` **verified in production**, with a test covering both the UI and the executor.
- B14b either implemented after user testing, or explicitly deferred to Phase 3 with the reason recorded — deferring is an acceptable outcome for this item.
- No email sent to any address other than the tester's own during verification.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Confirm `GMAIL_READ_ACTIONS_ENABLED=false`** in the production host's environment configuration.
2. **Use your own email address** for every send test.
3. **User-test the B14b manual-run modal** before committing to it. The audit's position is that this should be tested, not assumed.
4. **Decide when — or whether — to pursue the full D1 restricted-scope program.** Per A15 it now gates Create Draft as well as Find/Read/Reply, and it carries a CASA security assessment, a Letter of Assessment, annual re-assessment, and recurring cost. Backlog item; revisit after Phase 3.
