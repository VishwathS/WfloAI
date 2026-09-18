# Objective

Final acceptance before launch: the checks a machine cannot make.

Entry state: `INTEGRATION CERTIFIED` (Task 15). Exit state: `HUMAN ACCEPTED`.

Task 15 proved the product **works**. This task establishes that it is **usable and presentable** — that a person who has never seen WfloAI can get from a signup page to a working automation without being confused, misled, or embarrassed on the operator's behalf.

### The UI-testing decision — binding for this task and every autonomous loop

**Autonomous screenshot, computer-use, and browser-vision loops are deliberately not part of the release loop.** They are slow and expensive relative to what they catch, and they are not an acceptable substitute for a person looking at the product.

The division of labour is fixed:

| Verified by automation | Verified by the human |
|---|---|
| Structural behavior, application state, types, tests, builds, routing, persistence, integration behavior, RLS, API contracts — anything programmatically assertable | Visual quality, layout, hierarchy, copy, discoverability, perceived speed, whether a flow *feels* broken |

Claude's obligation when changing UI is **preservation**: keep the existing design-system conventions in CLAUDE.md (§Node visual design, the accent-colour table, the radius scale, the section-label pattern, Tailwind-only styling) and keep existing end-to-end UI flows intact. Preserving conventions is checkable from code. Judging the result is not, and that judgement happens here, once, near the end.

The agent's deliverable for this task is therefore **a concise, product-specific checklist the human can work through** — not a rendering of the product.

# Audit Items

**LAUNCH-16** — a launch-extension ID, not an original audit ID.

Touches deferred items without advancing them: **C1** (responsive/mobile) is accepted-or-noticed here, not fixed; **C2** (accessibility) is recorded here, not remediated; **C5** (toast system) is observed, not built. Finding UX problems in this task does **not** authorize fixing them — findings get a severity and a decision.

**Prerequisites:** Task 15 (`INTEGRATION CERTIFIED`). Surfaces from Tasks 07, 08, 09, 10, 12 are conditional on those tasks having shipped.

# Current State

### There is already a first-user QA report in the repository — and it is dated

`QA-REPORT.md` (repo root, 154 lines, dated **9 July 2026**) is a genuine first-user evaluation: fifteen workflows exercised programmatically plus a full browser session including a live Inngest cron firing. It contains a prioritized findings list (5 Critical/High, 9 Medium, 10 Low) and a "what's genuinely good" section.

**Treat it as prior art, not as current state.** Two commits since appear to address parts of it:

- `f356261` *"fix: prevent stale and lost node field edits, normalize structured output and router execution"* — plausibly covers findings #1 (deterministic router broken by the `Structured output:` prefix), #3 (keystroke loss), and #5 (prefix leaking into `final_output`).
- `db35849` *"feat: polish dashboard navigation, settings, and dropdown UI"* — plausibly covers parts of #2, #19, and the navigation-related polish items.

Neither mapping is confirmed. **Re-verify each finding against the deployed product rather than assuming it was fixed or assuming it was not.** A QA report that is partly stale is more dangerous than none, because it invites both mistakes.

### The surfaces that actually exist

Read from the repository — this is the basis of the checklist, adjusted from the generic list:

**Pages (4):** `app/(auth)/login/page.tsx`, `app/(dashboard)/page.tsx` (dashboard), `app/(dashboard)/settings/page.tsx`, `app/(dashboard)/workflows/[id]/page.tsx` (canvas).

**Dashboard components:** `dashboard-sidebar`, `sidebar-nav`, `workflow-list`, `create-workflow-button`, `template-gallery`, `use-template-button`.

**Canvas components:** `WorkflowCanvasShell`, `WorkflowCanvas`, `CanvasToolbar`, `NodeSidebar`, `ExecutionLog`, `RunHistorySidebar`, `WorkflowSettingsSidebar`, `NodeOutputDisplay`, `DeletableEdge`, `workflow-title-editor`, and nine node components.

**Settings components:** `GmailConnectionCard`, `CredentialsCard`.

**Auth components:** `login-card`, `sign-out-button`.

**What does not exist** and therefore cannot be accepted — record as N/A with the gating task:

| Absent surface | Gated by |
|---|---|
| Public landing page, `/privacy`, `/terms` | Task 07 |
| Signup gating UI (invite/waitlist) | Task 08 |
| Account deletion + export UI in Settings | Task 09 |
| Schedule-enable consent, quota/usage display, disconnect confirmation | Task 10 |
| `/help` page, onboarding tour, tooltips, first-run checklist | Task 12 (B10) |
| Toast system | C5, deferred — errors surface inline |
| `triggerNode` sidebar card | Not a task — registered in the canvas but absent from `NODE_CARDS` |

**Responsive:** C1 is deferred. The accepted V1 position is desktop-only **with an explicit "desktop recommended" notice on small screens**. Accepting this task means confirming that notice exists — or consciously accepting a silently broken canvas on mobile, which is a decision the operator makes explicitly rather than by omission.

# Required Changes

## 1. Autonomous — prepare the checklist, do not perform the inspection

- [ ] **Regenerate the surface inventory** from `app/` and `components/` as of today, and reconcile it against the table above. A surface that exists but is not on the checklist will not get looked at.
- [ ] **Re-derive which conditional surfaces shipped** by checking the repository, and mark the rest N/A with the gating task. Do not assume from `RELEASE_PROGRESS.md` alone.
- [ ] **Triage `QA-REPORT.md` against current code.** For each of its 24 prioritized findings produce one of: *appears fixed — evidence in `<file:line>`*, *appears open*, or *cannot determine from code — needs human check*. The third category is the most valuable output of this step, because it is exactly what the human checklist should contain.
- [ ] **Verify design-system conformance from code**, not from screenshots — this part *is* programmatically checkable: each node component follows CLAUDE.md's root-container/header/handle pattern and its assigned accent colour; the radius scale holds; no inline `style` props outside the documented `node.style` resize mechanism; section labels use the documented eyebrow pattern.
- [ ] **Produce the final human checklist** (§2 and §3) as a standalone artifact the operator can work through in one sitting, ordered by the sequence a real user encounters — not by component tree.
- [ ] **Do not** drive a browser, take screenshots, or run a vision loop as part of this task. If a question can only be answered visually, it belongs on the human checklist.

## 2. Human UI/UX acceptance checklist

Per surface. Mark each **Accept**, **Accept with noted defect**, or **Blocker**. Only Blockers stop launch.

### Entry and authentication
- [ ] Landing page (Task 07): loads **without a session**, states what the product does, links to `/privacy` and `/terms`. *The public homepage is an OAuth verification requirement, not a marketing nicety.*
- [ ] Legal pages render, are reachable from the landing page and login, and **no longer carry the `DRAFT — NOT REVIEWED BY COUNSEL` banner**.
- [ ] Login page: the Google button is obvious, the consent line is present and readable, and the loading state during redirect is not mistakable for a hang.
- [ ] Gating (Task 08): an ungated visitor is told *why* they cannot get in and what to do next — not shown a dead end.
- [ ] Sign-out is findable and returns somewhere sensible.

### Dashboard
- [ ] Empty state for a brand-new user makes the first action obvious.
- [ ] **"Last run" time and status dot are correct** — `QA-REPORT.md` finding #2 said it read the retired `execution_logs` table and showed "Never" for every workflow that had actually run. Verify against a workflow you just ran. This one silently tells every user their work did not count.
- [ ] Workflow list: names, timestamps, delete affordance, and a delete confirmation that cannot be hit by accident.
- [ ] Template gallery: the 15 templates are browsable, categories filter, and each says enough to choose from.
- [ ] **Use Template → first Run.** Templates ship with empty inputs, so the designed first-run experience is a validation error. Confirm the error names the offending node clearly — and decide whether "the wow moment opens with an error" is acceptable for V1.
- [ ] Navigation between dashboard, settings, and canvas is consistent.

### Canvas — the primary surface
- [ ] Node library: cards are grouped by category, and **how to add a node is discoverable**. `QA-REPORT.md` #4 and #15 found cards are focusable buttons that do nothing on click, with drag as the only path and nothing saying so.
- [ ] Drag-to-add, connect, and delete edges all behave predictably.
- [ ] **Typing into node fields is reliable** — no dropped characters, no wiped values after editing a label or dropping a node. `QA-REPORT.md` #3 rated this fatal to trust; commit `f356261` claims to address it. **Verify by typing fast.**
- [ ] Node headers distinguish nodes at canvas zoom (#8 found every Input reads identically).
- [ ] Node resize works and survives reload.
- [ ] Validation badges clear when the underlying errors are fixed (#6 found a stale "2 errors" pill persisting after a successful run).
- [ ] Renaming an Input node and its `{{key}}` consequence is either prevented, warned about, or propagated — not silent (#5).
- [ ] Auto-save indication is present and **singular** (#18 found two indicators pixels apart).
- [ ] Toolbar: Run, History, Settings pill, fullscreen. The **trigger/"No triggers" pill is the only entry to scheduling** — confirm it reads as tappable (#7 found it reads as status text, hiding scheduling entirely from first-time users).
- [ ] Disabled "coming soon" controls are either removed or clearly labelled (#10).

### Node configuration
- [ ] Each of the eight draggable node types: fields are labelled, placeholders are useful, and required fields are apparent before running.
- [ ] AI node: the action dropdown and its output shape are comprehensible; Extract's output-fields editor is present and usable (#22 found `outputFields` invisible on the node).
- [ ] Router: deterministic condition fields are explained well enough to use correctly.
- [ ] Gmail node: **Send is the only action**, and the "sends a real email" warning is unmissable.
- [ ] HTTP node: method, URL, headers, body, and credential selection are navigable without documentation, and **no secret value is ever displayed**.
- [ ] File Input: upload feedback exists, and the state is honest — `QA-REPORT.md` #7 found a "Ready" badge shown for a deleted file.
- [ ] Variables: the `{{previousOutput}}` vs `{{key}}` distinction is discoverable in-product (#9). These are the two behaviors the product currently hides.

### Execution feedback
- [ ] Running: progress is visible per node; nothing looks frozen.
- [ ] Output rendering is readable. **Markdown in text-mode output renders as raw text** (#8, #11) — decide render-it or suppress-it, but do not ship it undecided.
- [ ] Skipped and orphaned nodes are distinguishable from idle (#12) — or the limitation is accepted knowingly.
- [ ] A failing node produces a message a non-engineer can act on, and **no raw Postgres or provider error text reaches the user**.
- [ ] Execution log and run history are readable; outputs are expandable; delete works.

### Integrations (Settings)
- [ ] Gmail card: disconnected state explains what connecting does; connected state shows the address and granted capability; **disconnect asks for confirmation** (Task 10) and says what it will break.
- [ ] `requires_reconnect` state is comprehensible and gives a clear next action.
- [ ] Credentials card: add, replace-in-place, delete-with-usage-count all work; **secrets are write-only and never re-displayed**.
- [ ] Quota/usage display (Task 10), if shipped, matches reality after a send.

### Scheduling
- [ ] Workflow Settings sidebar is reachable and understandable.
- [ ] Cron building is possible without knowing cron; the timezone picker is usable (#19 found ~430 flat options, no search, no browser-TZ default).
- [ ] "Next run" is shown and correct.
- [ ] Enabling a schedule on a send-capable workflow presents the consent step (Task 10) and is **explicit that email will be sent while the user is not present**.
- [ ] Run-now gives feedback, and `last_run_at` updates (#13 found it did not).

### Cross-cutting
- [ ] **Empty, loading, and error states** for: dashboard, canvas, run history, settings, template gallery. Every one of the five, not a sample.
- [ ] **Responsive:** on a phone-width viewport, either the product is usable or the "desktop recommended" notice appears. A silently broken canvas is a Blocker; an explicit notice is an Accept.
- [ ] **Accessibility spot-check (C2, deferred):** keyboard-navigate login → dashboard → settings. Record what is unreachable. This is a record, not a remediation.
- [ ] Copy: no lorem ipsum, no placeholder text, no internal jargon, no stale product name.
- [ ] Browser console on the four pages: no uncaught errors, no leaked secrets or tokens.

## 3. Fresh-user acceptance flow

One sitting, one account that has never used WfloAI, on **production**. Do not fix anything mid-flow — note and continue. The point is the experience as it is, not as it becomes once a developer intervenes.

1. Arrive at the landing page signed out. Can you tell what this is?
2. Sign up / sign in with Google.
3. Pass whatever gating exists (Task 08).
4. First-run: is there any onboarding, or does the dashboard just appear? (Task 12 / B10 governs whether there is.)
5. Create a workflow — from scratch **and** from a template.
6. Build something real: Input → AI → Action, without reading documentation.
7. Connect Gmail from Settings.
8. Add a Gmail Send node and run it to your own address.
9. Add a credential and an HTTP node; run it.
10. **Leave the workflow and come back.** Everything you configured is still there.
11. Create a schedule; confirm the next run time; use Run-now.
12. Inspect run history; open an output; delete a run.
13. Manage integrations: disconnect Gmail, reconnect, delete a credential.
14. Find out what your limits are — can you, at all?
15. Delete the account (Task 09), if shipped.

Record, at the end: **the first moment you were confused**, and **the first moment you did not trust what the screen said**. Those two answers are worth more than the rest of the checklist combined.

# Verification

**Automated**

- [ ] `npm test` green, `npx tsc --noEmit` clean, `npm run build` succeeds.
- [ ] Design-system conformance verified from code (node template, accent colours, radius scale, no stray inline styles).
- [ ] No route regressions: every path reachable before is reachable now, and every gated path is still gated.
- [ ] No console errors on the four pages in a production build.

**Human — the point of this task**

- [ ] Every checklist item marked Accept / Accept-with-defect / Blocker by a person.
- [ ] The fresh-user flow completed end to end on production by someone who has not been building the product, if at all possible.
- [ ] Every `QA-REPORT.md` finding categorized fixed / open / accepted-for-V1.
- [ ] Every Blocker has an owner and a resolution before this task can complete.

# Stop Conditions

Stop and ask before proceeding if:

- **An autonomous screenshot, computer-use, or browser-vision loop is about to be started for visual QA.** That is explicitly out of scope for the release loop. If a check needs eyes, it goes on the human checklist.
- **A UX finding tempts a fix outside this task's scope.** Record it with a severity; fixing it is a separate, tracked change. C1/C2/C5 in particular are deferred and stay deferred.
- **A UI change would alter an existing end-to-end flow or break a design-system convention.** Preservation is the standing obligation; changing a flow at acceptance time invalidates Task 15's certification of it.
- **A Blocker requires production configuration, a deploy, or a migration to resolve.** Those are hard stops under MASTER §7.1 regardless of how small the fix looks.
- The human acceptance pass has not happened and completion is being contemplated anyway. **This task cannot be completed by an agent.** An agent prepares the checklist; only a person can mark it accepted.
- The fresh-user flow would run against an existing account with prior state. That is not a fresh-user flow.
- Sending real email or deleting a real account would be required outside a dedicated test account. Hard stops both.

# Completion Criteria

The state is `HUMAN ACCEPTED` when:

- The checklist artifact was **generated from the current repository**, covering every surface that exists and marking N/A with a reason for every one that does not.
- **A human has explicitly marked each item.** Agent-prepared, human-accepted — the acknowledgement is the deliverable and it cannot be delegated back.
- The fresh-user flow has been completed on production, with the "first confusion" and "first distrust" moments recorded.
- Zero open Blockers. Accept-with-defect items are listed with their severity and carried into Task 17's launch report.
- Every `QA-REPORT.md` finding is categorized, with the ones marked fixed actually re-verified rather than inferred from a commit message.
- Design-system conformance verified from code.
- All three verification commands green; `git diff` reviewed.
- The human acceptance is recorded in `RELEASE_PROGRESS.md` under Manual Actions, with a date and who performed it.

# Manual / External Steps

1. **Do the acceptance pass yourself.** No agent can complete this task. Block an hour and do not multitask.
2. **Get a second pair of eyes** for the fresh-user flow if at all possible — someone who has not been building the product. Their first confusion is the real signal; yours is compromised by knowing where everything is.
3. **Use a genuinely fresh account** on production, with no prior state.
4. **Send only to your own address**; delete only a dedicated test account.
5. **Check a phone-width viewport** and decide explicitly between desktop-only-with-notice and blocking.
6. **Record the accepted defects** — they become the known-issues list in Task 17's launch report. An accepted defect that nobody wrote down becomes a surprise support ticket.
