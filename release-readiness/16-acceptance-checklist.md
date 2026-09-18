# Task 16 — Human acceptance checklist

Prepared 2026-09-17 from the repository at `87a4ea6`. **An agent cannot complete
this task.** Everything under "Human checklist" is for a person, on
**production**, after Task 15 is `INTEGRATION CERTIFIED`. Mark each item
**Accept**, **Accept with defect** (+ severity) or **Blocker**. Only Blockers
stop launch; every accepted defect goes into Task 17's known-issues list.

## 1. What the agent verified from code

### Surface inventory (regenerated)

Pages (9): `/` (marketing), `/privacy`, `/terms`, `/help`, `/login`,
`/waitlist`, `/dashboard`, `/settings`, `/workflows/[id]`.

Conditional surfaces — **all shipped**, so none is N/A: landing + legal (07),
invite gate `/waitlist` (08), account deletion + export in Settings (09),
schedule consent + quota display + disconnect confirmation (10), `/help` +
run-history pagination (12).

Still absent: toast system (C5, deferred — errors are inline), Trigger sidebar
card (registered, not draggable), onboarding tour, **small-screen notice** (C1).

### Design-system conformance

| Check | Result |
|---|---|
| Node idle accents vs the CLAUDE.md table | 7/7 documented nodes match. `gmailNode` (red) and `httpRequestNode` (indigo) are **missing from the CLAUDE.md table** — a documentation gap, not a code defect |
| Resize zone on every node | 9/9 |
| Inline `style` props | 4, all pre-existing dynamic positioning: `DeletableEdge.tsx:41` (edge-label transform), `ExecutionLog.tsx:116` (width), `RouterNode.tsx:148,155` (true/false handle offsets). Recorded, not changed |
| Small-screen "desktop recommended" notice | **Absent.** Task 16 treats a silently broken phone canvas as a **Blocker** unless the operator explicitly accepts desktop-only |

### Routing and gating (from tests)

`tests/publicPaths.test.ts` and `tests/proxyAdmission.test.ts`: `/`, `/privacy`,
`/terms`, `/help` are public; `/dashboard`, `/settings`, `/workflows/*` are gated;
an unrecognised path is gated by default; `/waitlist` does not loop; `/settings`
is reachable by an authenticated unapproved user. 332 tests pass at `87a4ea6`.

### `QA-REPORT.md` triage (9 Jul 2026 report vs current code)

"Appears fixed" means the code shows the fix — **still re-verify on production.**

| # | Finding | Triage | Evidence |
|---|---|---|---|
| 1 | Deterministic router broken by the `Structured output:` prefix | Appears fixed | the router parses `stripStructuredPrefix(context)` — `lib/execution/serverExecutor.ts:311` |
| 2 | Dashboard "Last run" reads `execution_logs` | Appears fixed | `app/(dashboard)/dashboard/page.tsx:44` reads `workflow_runs` |
| 3 | Keystroke loss in node fields | Appears fixed in code | `hooks/useBufferedField.ts` (commit `f356261`) — **human: type fast** |
| 4 | Router dead-end branch = silent success | Appears open | routing filters edges by handle (`serverExecutor.ts:528`); no warning found for an unconnected routed handle |
| 5 | Prefix leaks into `final_output` | Cannot determine from code | stored output is the node's raw output (`execute/route.ts:188`) — check a stored row in Task 15 row 21 |
| 6 | Stale "N errors" badge | Needs human check | |
| 7 | File "Ready" for a deleted file | Appears open | `FileInputNode.tsx:238` shows Ready from node data; a missing row surfaces only at run time |
| 8 | Template first run errors; no scroll-to-error | Appears open | no scroll/centre-on-error found |
| 9 | Two variable conventions undocumented | Appears fixed | hints in `AINode.tsx:187`; legacy `{{input}}` auto-converted; `/help` explains |
| 10 | Input rename silently rewrites `{{key}}` | Appears open | `InputNode.tsx:31` sets `key: labelToKey(label)` on every label edit |
| 11 | Raw markdown in text outputs | Appears open | no markdown renderer in `NodeOutputDisplay.tsx` — **decide render or suppress** |
| 12 | Skipped nodes look idle | Appears open | no skipped status in execution events |
| 13 | Run-now doesn't update `last_run_at` | Appears open | `last_run_at` is written only by the poller's claim (`lib/inngest/functions.ts:95`); the Run-now route does not set it |
| 14 | No UI for `input_values` | Open (deferred by design) | |
| 15 | No click-to-add / drag hint | Appears open | cards are `draggable` only (`NodeSidebar.tsx:128`) |
| 16 | "No triggers" pill not tappable-looking | Needs human check | |
| 17 | Node headers don't show the label | Needs human check | |
| 18 | Duplicate save indicators | Appears open | `workflow-title-editor.tsx:64` and `CanvasToolbar.tsx:56` |
| 19 | Timezone picker | Partly fixed | browser-TZ default (`WorkflowSettingsSidebar.tsx:62`); search — human check |
| 20 | Lookup under "Sources" | Open | `NodeSidebar.tsx` category "Sources" |
| 21 | "Coming soon" toolbar buttons | Open | `WorkflowCanvas.tsx:441,450` |
| 22 | Extract `outputFields` invisible | Appears fixed | editable field at `AINode.tsx:56` |
| 23 | "Add an Input node" wording | Open | `lib/execution/validate.ts:87` |
| 24 | No next-occurrences preview | Open | none found |

## 2. Human checklist (production, one sitting)

Carry-forward HUMAN_UI_CHECK_REQUIRED items from Tasks 01–12 are marked **[CF]**.

### Entry and authentication
- [ ] Landing loads signed out, says what WfloAI does, links to `/privacy` and `/terms`
- [ ] **[CF 07]** A signed-in visitor on `/` sees sensible copy (currently a "Sign in" button that routes onward to `/dashboard`)
- [ ] **[CF 07]** All public pages load in a **private window** on the **deployed domain**
- [ ] Legal pages render; **DRAFT banner still present** (removal is a counsel action — record its state)
- [ ] Login: Google button obvious, consent line readable, redirect loading not mistakable for a hang
- [ ] **[CF 08]** A fresh account lands on `/waitlist`; copy says invite-only, the code unlocks immediately, waiting grants nothing
- [ ] **[CF 08]** After redeeming, access applies **without signing in again**
- [ ] **[CF 08]** No redirect loop from `/`, `/settings`, or a workflow URL (signed in; unapproved and approved)
- [ ] **[CF 08]** CAPTCHA — **not configured** (a Task 08 hard stop); record whether V1 launches without it
- [ ] **[CF 01]** Logged-out `/settings` redirects to login in a private window
- [ ] Sign-out findable, returns somewhere sensible

### Dashboard
- [ ] The empty state for a brand-new user makes the first action obvious
- [ ] "Last run" time + status dot correct for a workflow you just ran (QA #2)
- [ ] The delete confirmation cannot be hit by accident
- [ ] Template gallery: 15 templates browsable, categories filter
- [ ] Use Template → first Run: the error names the offending node; **decide** whether "the first run is an error" is acceptable (QA #8)

### Canvas
- [ ] **[CF 06 — Canvas]** Full canvas regression after the Next 16 / React 19 upgrade: drag, connect, delete edges, pan/zoom, fullscreen
- [ ] How to add a node is discoverable (QA #4/#15)
- [ ] **Typing fast** into Input, AI prompt and HTTP body never drops characters or wipes values (QA #3)
- [ ] Node headers distinguishable at zoom (QA #17)
- [ ] Resize survives reload
- [ ] The validation badge clears when errors are fixed (QA #6)
- [ ] Input rename → the `{{key}}` consequence is visible, or accepted as a defect (QA #10)
- [ ] One save indicator, or accept the duplicate (QA #18)
- [ ] The trigger/"No triggers" pill reads as clickable — it is the only way into scheduling (QA #16)
- [ ] "Coming soon" buttons acceptable or not (QA #21)

### Node configuration
- [ ] **[CF 01]** The Gmail dropdown offers **Send Email only** — no Create Draft
- [ ] The Gmail "Sends a real email" warning is unmissable
- [ ] HTTP node navigable without docs; no secret ever displayed
- [ ] File Input: upload feedback; state honest after deletion (QA #7)
- [ ] Extract output-fields editor usable (QA #22)
- [ ] `{{previousOutput}}` vs `{{key}}` discoverable (QA #9)

### Execution feedback
- [ ] Per-node progress visible; nothing looks frozen
- [ ] **[CF 04]** The UI explains what happens if the browser disconnects mid-run (currently not surfaced — Task 04 left it as product copy)
- [ ] Markdown in text outputs: **decide render or suppress** (QA #11)
- [ ] Skipped/orphan nodes: accept knowingly or not (QA #12)
- [ ] Failing-node messages are actionable; no raw Postgres or provider text
- [ ] Execution log + history readable; expand, delete and **Load older runs** work

### Settings
- [ ] The Gmail disconnected state explains what connecting does
- [ ] The connected state shows the address and "Send emails" only
- [ ] **[CF 10]** The disconnect confirmation says what breaks; **Cancel leaves Gmail connected**
- [ ] The `requires_reconnect` state has a clear next action
- [ ] Credentials: add, replace, delete-with-usage; secrets never re-shown
- [ ] The quota display matches reality after a send
- [ ] Account export downloads; account deletion requires the typed phrase

### Scheduling
- [ ] Workflow Settings reachable and understandable
- [ ] Cron building possible without knowing cron; timezone picker usable (QA #19)
- [ ] "Next run" shown and correct
- [ ] **[CF 10]** The consent step reads as being about **unattended** sending ("without you present")
- [ ] Run-now gives feedback; `last_run_at` does **not** update today (QA #13) — accept or not
- [ ] An auto-disabled schedule's amber panel is understandable

### Cross-cutting
- [ ] Empty / loading / error states for dashboard, canvas, run history, settings and template gallery — **all five**
- [ ] **Phone width — OPERATOR DECISION REQUIRED:** the product is usable **or** shows a desktop notice. **No "desktop recommended" notice exists today** (re-checked 2026-09-17; not built or invented by the agent). Decide: (a) accept desktop-only explicitly and record who accepted it, or (b) ask for the notice (C1 half-day item) before launch. Until decided this is a Blocker
- [ ] Keyboard-navigate login → dashboard → settings; record what is unreachable (C2, record only)
- [ ] No placeholder text — the contact placeholders were replaced by `vishwath@ucsb.edu` in `d78e84d`; confirm the privacy, terms and `/help#contact` links read correctly and open a mail client
- [ ] **Gmail connect consent screen (after deployment):** Google should list sending email plus basic identity (your email address) — nothing about reading mail. Settings then shows "Connected as <address>". Changed in `fee570c`
- [ ] Browser console on each page: no uncaught errors, no tokens
- [ ] **[CF 12]** `/help` is clear; the README matches the product
- [ ] **[CF 06 — Middleware]** Every gated path still gated and every public path still public (spot-check in the browser after the proxy rename)

### Fresh-user flow (a person who did not build WfloAI, if possible)
1. Land signed out — can you tell what this is?
2. Sign in with Google → invite → dashboard
3. Create a workflow from scratch and from a template
4. Build Input → AI → Action without docs
5. Connect Gmail; send to your own address
6. Add a credential + HTTP node; run
7. Leave and come back — everything still there
8. Create a schedule; check the next run; Run-now
9. Inspect history; open an output; delete a run
10. Disconnect/reconnect Gmail; delete a credential
11. Find your limits
12. Delete the account (dedicated test account only)

Record **the first moment you were confused**, and **the first moment you did not
trust what the screen said**.

## 3. Result

`HUMAN ACCEPTED`: **No** — not started; depends on Task 15.
