# Objective

Make sending real email as the user something they authorize deliberately — particularly when the sending is **unattended**, on a schedule, with nobody watching.

Also: keep Gmail read actions off in production for V1, and verify that they are off rather than assuming it.

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

- [ ] Add an explicit consent step when **enabling a schedule** on a graph that contains a send-capable Gmail node. It must state plainly: this will send real email from your connected account, automatically, without you present. Detect send-capability from the graph, reusing the static analysis already in `lib/execution/validate.ts` rather than writing a second graph walker.
- [ ] Record the authorization — who consented, when, for which workflow. `integration_audit_events` is the natural home.
- [ ] Surface **quota and current usage in Settings** — sends used this minute and today, against the limits. A limit the user cannot see is a limit they will hit by surprise.
- [ ] Add a **confirmation to Gmail disconnect**. It silently breaks every workflow depending on it.

### Phase 3 — B14b

- [ ] Modal on first manual Run of a graph containing Send or Reply. **User-test this rather than shipping it on assumption** — the audit's explicit position is that this is a design choice, not a mandate.

### Ongoing — D1

- [ ] Verify `GMAIL_READ_ACTIONS_ENABLED=false` in the production environment. Verify; do not assume.
- [ ] Add a test asserting that with the flag off, Find/Read/Reply are absent from the action dropdown **and** rejected by the executor. Both halves — a UI-only check would miss a crafted graph.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Test: enabling a schedule on a send-capable graph without consent is rejected.
- [ ] Test: enabling a schedule on a graph with **no** send-capable node requires no consent — the friction must not apply where it is not warranted.
- [ ] Test: with `GMAIL_READ_ACTIONS_ENABLED=false`, a graph containing a Find/Read/Reply node fails execution even if the graph JSONB was crafted directly.
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
