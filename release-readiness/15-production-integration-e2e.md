# Objective

Prove the **deployed** product works end to end, against production infrastructure, for the actual V1 capability set.

Entry state: `PRODUCTION READY` (Task 13) plus Gmail connectable by real users (Task 14). Exit state: `INTEGRATION CERTIFIED`.

### This task runs exactly once

**There is one authoritative certification pass and one completion event.** It happens after Task 13 and Task 14 have both satisfied their prerequisites — never before, because a pass that records Gmail as untested is not a certification of V1.

What that pass certifies is a **named commit** deployed to production. Record the commit SHA in the evidence log; certification is meaningless without knowing what was certified.

A `COMPLETE` Task 15 is never reopened. If a deploy lands after certification, the deployed commit no longer matches the certified one, and that is caught at **Task 17 Gate 6** — whose remedy is a delta re-verification of the affected capabilities, recorded under Task 17. Do not reopen this task, do not schedule a second pass, and do not treat `INTEGRATION CERTIFIED` as provisional.

**A green `npm test`, a clean `tsc --noEmit`, and a successful `npm run build` do not complete this task.** They prove the code compiles and the pure functions behave. They say nothing about whether a scheduled workflow fires at 6am against Inngest Cloud, refreshes a Gmail token, sends mail as the user, and persists a run row — which is the product.

The failures this task exists to find are the ones that **only exist in production**: platform function timeouts, per-instance state that doesn't survive serverless, cold starts, exact-match OAuth redirect URIs, and cross-system timing.

# Audit Items

**LAUNCH-15** — a launch-extension ID, not an original audit ID. It does not re-map any A/B/C/D item.

Relationship to deferred work: **C9 (E2E tests / Playwright) stays deferred.** This task is *production certification by defined scenario with recorded evidence*, not an automated browser-test suite. If building a Playwright suite becomes the plan, that is C9 coming forward and needs a decision, not a drift.

**Prerequisites:** Task 13 (`PRODUCTION READY`) and Task 14 (Gmail usable by a non-test account). Capability rows whose feature ships in an earlier task (07, 08, 09, 10) are conditional — see §Conditional capabilities.

# Current State

### The V1 capability set, read from the repository

Nine node types are registered in `components/canvas/WorkflowCanvas.tsx:60`:

```
triggerNode · aiNode · routerNode · actionNode · lookupNode
inputNode · fileInputNode · gmailNode · httpRequestNode
```

**Eight of them are draggable.** `NodeSidebar.tsx`'s `NODE_CARDS` lists `inputNode`, `fileInputNode`, `lookupNode`, `gmailNode`, `httpRequestNode` (Sources), `aiNode` (AI), `routerNode` (Logic), `actionNode` (Actions). **`triggerNode` is registered in the canvas and handled by both executors but has no sidebar card** — it can only enter a graph via a template or an existing saved workflow. This is a real divergence from the assumed capability list and it changes what "test the Trigger node" means: there is no user-reachable path to add one.

Twenty-three API routes exist. `app/api/execute` (legacy single-step) and `app/api/workflows/[id]/execute` (primary SSE run path) are both live; CLAUDE.md marks the former as not the primary path, and it remains the only consumer of `executor.ts`.

Fifteen templates in `lib/templates/definitions.ts`, surfaced through `components/dashboard/template-gallery.tsx`.

### Adjustments to the assumed capability list

| Assumed | Repository reality |
|---|---|
| "Gmail Send" | Correct, and it is the **only** Gmail action in V1. Create Draft / Find / Read / Reply require Restricted scopes and are gated off (Task 01 A15 + Task 10 D1). Do not test them; confirm they are **unreachable**. |
| "Trigger" implied as buildable | Registered and executable, **not draggable**. Test it via a template or saved graph, or record it as not user-reachable. |
| "Google authentication" | Supabase Google OAuth only. No email/password path exists. |
| "Account deletion" | Task 09. Conditional — see below. |
| "HTTP GET / POST" | The node supports GET/POST/PUT/PATCH/DELETE. GET and POST are the minimum; the mutating verbs share the idempotency-ledger path, so at least one non-POST mutation is worth covering. |
| Not in the assumed list, but real | Template gallery + Use Template · workflow rename/delete · run delete · file replace/delete · schedule enable/disable/delete · schedule Run-now · node resize persistence · incremental-auth "enable email reading" (must be **absent/off** in V1) · credential replace-in-place |

### Production-only failure modes to hunt deliberately

These are the reason this task is not "run the QA script again against a different URL":

1. **Execute-route timeout.** `app/api/workflows/[id]/execute/route.ts` declares `maxDuration` only after Task 04. The `workflow_runs` insert happens **after** the SSE stream drains, so a platform timeout produces a truncated stream **and no run row** — the user sees a half-finished run that history has no record of. A long AI chain is the scenario that surfaces it.
2. **`MAX_CONCURRENT_REQUESTS: 5` is per-instance.** `lib/integrations/limits.ts:16` holds `activeRequestsByUser` in a module-level `Map`. On serverless this is **a no-op across instances** — the file's own comment concedes it. **Task 03 owns its resolution** and records which of two options it took; certify whichever one it actually chose:

   - If Task 03 chose **A** (a durable mechanism), assert that mechanism holds across instances in production — a single-instance pass proves nothing here.
   - If Task 03 chose **B** (removed or reframed the control), assert the durable protections Task 03 named in its place: the ledger-derived per-minute/per-day windows, `MAX_EXTERNAL_ACTIONS_PER_RUN`, the per-run AI-node cap, `maxDuration`, and the schedule floor and cap.

   Never certify the in-memory `Map` as a working control, under either option. If Task 03's record does not say which option it took, that is a Task 03 defect — record it as a finding rather than guessing.
3. **Scheduled runs execute on a cold instance with no user session**, through the admin client, with `deriveRunId(event.id)` for idempotency. Timing, cold start, and the compare-and-swap claim are all production behaviors.
4. **Token refresh happens hours after connect**, unattended. The optimistic-CAS refresh in `lib/gmail/client.ts` is only exercised by real elapsed time.
5. **Exact-match OAuth origins** (Task 13/14). Anything tested on a preview URL proves nothing about production.

### Conditional capabilities

Some rows depend on tasks that may or may not have shipped. Mark each **N/A — feature not in this release** with the reason, or test it. Do not silently omit:

| Capability | Gated by |
|---|---|
| Public landing page, `/privacy`, `/terms` | Task 07 |
| Signup gating / invite / waitlist / CAPTCHA | Task 08 |
| Account deletion, data export | Task 09 |
| Schedule-enable consent step, quota visibility in Settings, disconnect confirmation | Task 10 |
| `/help` page, run-history pagination, retention cleanup | Task 12 |

# Required Changes

## 1. Autonomous — before any production run

- [ ] **Regenerate the capability matrix below from the current repository.** Re-derive node types from `WorkflowCanvas.tsx`'s `nodeTypes` and `NodeSidebar.tsx`'s `NODE_CARDS`, routes from `app/api/`, and Gmail actions from `lib/gmail/scopes.ts`. If the repo has changed, the matrix changes — this file is a starting point, not the authority.
- [ ] **Build the evidence log skeleton** — one row per capability and per whole-workflow scenario, with columns for date, actor, result, and the artifact reference. Certification is the log, not a summary sentence.
- [ ] **Record the certified build at the head of the evidence log**: the commit SHA deployed to production, and the host's deployment identifier. Every row in the log certifies *that* build. Confirm the deployed commit matches the repository HEAD being certified before the first scenario runs — if a deploy lands partway through certification, the rows completed before it certify a build that is no longer deployed, and those rows must be re-run against the new build within this same pass.
- [ ] **Confirm every Restricted-scope Gmail action is unreachable** before testing anything else. If Create Draft is selectable in production, stop: Task 01 or Task 14 is incomplete and the scope premise is wrong.
- [ ] **Prepare the controlled HTTP endpoint** for the HTTP-node scenarios — an endpoint you own that accepts POST, echoes headers, and that you can inspect. Do not point production tests at third-party APIs you do not control.
- [ ] **Prepare test fixtures:** a small TXT, a small text-bearing PDF, a CSV, one scanned/image PDF (the negative case), and one file above the per-type limit.

## 2. The capability matrix

Legend — **Auto**: can be asserted programmatically against production. **Manual**: needs a human. **Side effect**: creates real external effect or spend. Evidence is what completion requires; an assertion without it is not a pass.

### Authentication and account

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Google sign-in | Fresh eligible account signs in at production `/login` | Lands on dashboard, session cookie set | Partial | Yes | New user row | Screenshot + `auth.users` row |
| 2 | Auth gate | Signed-out request to `/`, `/workflows/<id>`, `/settings` | Redirect to `/login` — **`/settings` included** (Task 01 A4) | Yes | — | No | `curl -I` per path |
| 3 | Open-redirect guard | `/auth/callback?next=//example.com` | Redirect stays on the production origin | Yes | — | No | Response `Location` header |
| 4 | Sign out | Sign out, then revisit a gated page | Redirected to login; session invalid | Yes | — | No | Request trace |
| 5 | RLS isolation | User A requests user B's workflow, run, file, credential, schedule | 404/403 on every one — check each resource type | Yes | — | No | Per-resource response |

### Workflow lifecycle

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 6 | Create | New workflow from the dashboard | Row created, canvas opens | Yes | — | DB row | Workflow id |
| 7 | Auto-save | Add nodes/edges, wait past the 700ms debounce | Graph persisted; one PATCH per settled change, not per keystroke | Partial | Yes | DB write | Network trace + stored `graph` |
| 8 | Reload fidelity | Hard-reload the canvas | Nodes, edges, field values, and `node.style` dimensions all restored | Partial | Yes | No | Before/after screenshots |
| 9 | Rename | Rename via the title editor | Persisted; dashboard reflects it | Yes | — | DB write | Row |
| 10 | Delete | Delete from the dashboard | Row gone; cascade removes runs/files/schedules | Yes | — | **Destructive** | Per-table row counts |
| 11 | Template | Use Template from the gallery | Graph cloned and runnable after required inputs are filled | Partial | Yes | DB row | Cloned graph |

### Node execution

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 12 | Input | Input → AI, value reaches the prompt | Value present in output | Yes | — | AI spend | Run output |
| 13 | Trigger | Graph containing a `triggerNode` (template/saved only — **not draggable**) | Executes and passes through | Yes | — | No | Run output |
| 14 | File Input — TXT | Upload, extract, summarize | Extracted text reaches the AI node | Partial | Yes | Storage + AI | `workflow_files` row + run |
| 15 | File Input — PDF | Text-bearing PDF | Extracted, `page_count` set | Partial | Yes | Storage + AI | Row |
| 16 | File Input — negative | Scanned PDF; oversize file | 422 "scanned or image-based"; size error. **Nothing persisted** in either case | Yes | — | No | Response + absence of row/object |
| 17 | AI node | Each action: Summarize, Rewrite, Classify, Extract, Generate | Valid JSON matching each action's schema | Yes | — | AI spend | Parsed outputs |
| 18 | Router — AI | Classifier → router | Exactly one branch runs | Yes | — | AI spend | Node events |
| 19 | Router — deterministic | `conditionField`/`conditionValue` matching upstream JSON | Deterministic match; **no AI call for the routing decision** | Yes | — | No | Events showing no router AI call |
| 20 | Lookup | Tavily query with `{{previousOutput}}` | Formatted results flow downstream | Yes | — | Tavily spend | Run output |
| 21 | Action | Save/Log/Display | Renders cleanly with **no `Structured output:` prefix leaking** into stored `final_output` | Yes | — | No | `workflow_runs.final_output` |
| 22 | Variables | `{{key}}` from Input; `{{previousOutput}}` upstream | Both resolve; undefined `{{var}}` fails validation pre-run | Yes | — | No | Validation error + run output |
| 23 | Validation | Cycle; missing required field; empty AI prompt | 400 before any AI spend | Yes | — | No | Responses |

### Integrations

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 24 | Gmail connect | Fresh account connects in production | Connected; `gmail_connections.scopes` = `gmail.send` only | Partial | Yes | Google grant | Row + Console |
| 25 | **Gmail Send** | Workflow sends to the tester's **own** address | Delivered; `From` is that user | Partial | Yes | **Real email** | Received message + `workflow_runs` |
| 26 | Gmail idempotency | Replay the same `runId:nodeId` claim | Second attempt replays stored output; **no second email** | Yes | — | Would-be email | Ledger row + inbox showing one message |
| 27 | Gmail restricted actions | Attempt Create Draft / Find / Read / Reply, including via crafted graph JSONB | Absent from dropdown **and** rejected by the executor | Yes | — | No | Both results |
| 28 | Gmail token refresh | Run a Send after the access token has expired | Transparent refresh, one Google call | Partial | Yes | Real email | Timestamps on `access_token_expires_at` |
| 29 | Gmail external revoke | Revoke at Google, then run Send | `status='requires_reconnect'`, clear message, no retry storm | Partial | Yes | No | Row + user-visible error |
| 30 | Gmail disconnect | Disconnect from Settings | Row removed **and grant gone from the Google permissions page** | Partial | Yes | Revocation | Permissions page check |
| 31 | HTTP GET | GET against the controlled endpoint | Response body flows downstream | Yes | — | Outbound request | Run output |
| 32 | HTTP POST | POST with body to the controlled endpoint | Endpoint receives the payload | Yes | — | Outbound mutation | Endpoint log |
| 33 | HTTP mutation idempotency | Replay a POST claim | No duplicate request at the endpoint | Yes | — | Would-be request | Endpoint log + ledger |
| 34 | Stored credential | Bearer / Basic / API-key against the endpoint | Correct header arrives; **secret never appears** in node output, run history, or ledger | Yes | — | Outbound request | Endpoint log + redaction check on stored rows |
| 35 | Credential lifecycle | Create, replace in place, delete with usage count | Secrets write-only; no API returns a decrypted value | Yes | — | DB write | Responses |
| 36 | SSRF guard | HTTP node targeting a hostname that resolves to a private/loopback/metadata address | Rejected at connect time, not after | Yes | — | No | Node error |
| 37 | Redaction | An endpoint that echoes the credential back | Echoed secret is `[REDACTED]` in output, error, run history, and ledger | Yes | — | Outbound request | Stored rows |

### Execution surface and history

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 38 | SSE streaming | Run a multi-node graph in production | Events stream progressively; canvas updates live | Partial | Yes | AI spend | Event trace + screen recording |
| 39 | **Long-run durability** | Run a graph long enough to approach the platform function limit | Completes, **or** fails cleanly with a persisted error run — never a truncated stream with no row | Yes | — | AI spend | Stream tail + `workflow_runs` row |
| 40 | Client disconnect | Close the tab mid-run | Defined behavior; a run row exists or its absence is understood and recorded | Partial | Yes | AI spend | Row state |
| 41 | Run history | Open the sidebar after runs | Newest-first, expandable, matches actual runs | Partial | Yes | No | Screenshot + rows |
| 42 | Run delete | Delete a run | Row removed; RLS enforced | Yes | — | Destructive | Response |
| 43 | Error run | Force a node failure | `status: "error"`, first error captured, visible in history | Yes | — | No | Row |

### Scheduling — the highest-value section

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 44 | Create schedule | Create with cron + IANA timezone | Row created, `next_run_at` computed correctly for that timezone | Yes | — | DB write | Row |
| 45 | Cron validation | Invalid expression; sub-minimum interval (Task 05) | 400 both | Yes | — | No | Responses |
| 46 | Run now | Per-schedule Run-now | Event published, run executes | Partial | Yes | AI spend | Run row |
| 47 | **Real cron fire** | Set a near-future schedule, **leave the browser closed**, wait | Fires within its minute; `workflow_runs` row with `trigger: "scheduled"` | Partial | Yes | AI spend | Row timestamps vs. schedule |
| 48 | Exactly-once claim | Observe an occurrence across the poller | Exactly one run per occurrence — the CAS claim holds in production | Yes | — | No | Run count for the occurrence |
| 49 | Overdue behavior | Re-enable a schedule whose `next_run_at` is in the past | Fires **once**, no backfill storm | Yes | — | AI spend | Run count |
| 50 | Scheduled failure | Scheduled run whose graph fails a node | `status: "error"` row, visible in history, **schedule not auto-disabled** unless Task 05 implemented it — record which | Yes | — | No | Row + schedule state |
| 51 | Failure is observable | Same run | The error reaches the reporter/logs from Task 02 with a distinguishable scheduled-run signal | Partial | Yes | No | Reporter event |
| 52 | `input_values` | Schedule with an Input override | Override applied, original `defaultValue` unchanged in the saved graph | Yes | — | AI spend | Run output + graph |
| 53 | Disable/delete | Disable, then delete | `next_run_at` null on disable; no further runs after either | Yes | — | DB write | Rows over time |
| 54 | Latest-graph semantics | Edit a scheduled workflow, then let it fire | Runs the **latest saved graph** (CLAUDE.md records this; C10 versioning is deferred). Confirm the behavior is what the operator expects | Yes | — | AI spend | Run output |

### Data lifecycle

| # | Capability | Scenario | Expected | Auto | Manual | Side effect | Evidence |
|---|---|---|---|---|---|---|---|
| 55 | File delete/replace | Replace a file; delete a file | Old object removed; node reflects the new file | Yes | — | Storage | Bucket listing |
| 56 | Stale `fileId` | Run against a deleted file | Descriptive node error, no crash | Yes | — | No | Node error |
| 57 | **Account deletion** (Task 09) | Delete a dedicated test account | Zero rows across all nine tables; zero objects under `{user_id}/`; **grant gone from the Google permissions page** | Partial | Yes | **Irreversible** | Per-table counts + bucket listing + permissions page |
| 58 | Data export (Task 09) | Export from Settings | Valid JSON containing workflows and runs | Yes | — | No | File |

## 3. Whole-workflow scenarios

Individual nodes passing does not mean compositions pass. Each scenario below tests **composition** — context propagation, ordering, and cross-system behavior. Run each on production, from the UI, as a real user.

| ID | Scenario | What it actually tests | Side effect |
|---|---|---|---|
| **W1** | Input → AI (Summarize) → Action | The baseline. Variables, structured output, display without prefix leakage. No external side effect — run it first so a failure here is unambiguous | AI spend |
| **W2** | Input → Lookup → AI (Rewrite) → **Gmail Send** | The flagship path: live web data → AI → real email as the user. Tests context propagation through a plain-text node (Lookup) into a structured one, then out | Tavily + AI + **real email to self** |
| **W3** | File Input (PDF) → AI (Extract) → **HTTP POST** | Extraction → typed output → authenticated outbound mutation with a stored credential. Tests redaction and the idempotency ledger on the HTTP side | Storage + AI + outbound POST |
| **W4** | **Scheduled trigger → AI → Gmail Send** | **The single most important scenario in this task.** Crosses Inngest Cloud, the cron poller, the CAS claim, the admin client, cold start, Gmail token refresh, and real delivery — with **no user present**. Nearly every one of those is production-only. Leave the browser closed | AI + **real email to self**, unattended |
| **W5** | Input → AI (Classify) → Router (deterministic) → two branches | Composition of branching: exactly one branch runs, the deterministic check actually fires, and the dead branch is distinguishable from idle | AI spend |
| **W6** | Scheduled workflow with a deliberately failing node | The failure path across systems: error run persisted, visible in history, observable in the reporter, schedule state as designed. **A product whose failures are invisible is not certified** | Minimal |
| **W7** | Input → AI → HTTP GET (credentialed) → AI | A credential round-trip with an AI hop on each side — confirms the secret never surfaces in any intermediate output | Outbound request + AI |

W4 and W6 are the two that cannot be substituted with a manual run. Everything else has a local analogue; those two do not.

# Verification

**Automated**

- [ ] `npm test` green, `npx tsc --noEmit` clean, `npm run build` succeeds. **Necessary, nowhere near sufficient** — see Objective.
- [ ] Every matrix row marked **Auto** asserted against production with its evidence recorded.
- [ ] Redaction assertions run against **stored** rows (`workflow_runs.node_outputs`, `integration_action_executions.result_output`), not only against the response the tester saw.

**Manual**

- [ ] Every matrix row marked **Manual** performed by a human with a dated artifact.
- [ ] All seven whole-workflow scenarios executed on production with recorded evidence.
- [ ] W4 executed with the browser closed and its timing compared against the schedule's `next_run_at`.
- [ ] Every conditional capability either tested or explicitly recorded as **N/A — feature not in this release** with the reason. Silent omission is a certification failure.
- [ ] Every row that did **not** pass is recorded as a finding with a severity and a decision — fix now, accept for V1, or defer — not quietly re-run until green.

# Stop Conditions

Stop and ask before proceeding if:

- **Any test would send email to an address that is not the tester's own.** Hard stop. W2 and W4 both send real mail and both are restricted to the tester's own address. This stop is not relaxed to complete certification — if a scenario cannot be verified without mailing a third party, it does not get verified.
- **Testing would touch real user data or a non-test account.** Hard stop. Row 57 (account deletion) is irreversible and runs only against a dedicated test account.
- **Any production infrastructure change, deploy, migration, secret, or provider billing change** would be needed to make a test pass. Hard stop — bring the need back; do not reconfigure production to satisfy a test.
- **A Restricted Gmail scope would be needed.** Hard stop. Row 27 tests that they are *unreachable*; needing one means the scope premise broke.
- The HTTP scenarios would target a third-party endpoint you do not control, or any internal/private address. Use the controlled endpoint.
- **Certification would proceed on a preview deployment** rather than production. OAuth origins are exact-match and preview origins are unregistered; a preview pass is not a production pass.
- Building an automated browser suite starts to look necessary. That is **C9** and it is deferred — raise it as a decision rather than starting it inside this task.
- Test volume would approach the provider budget caps from Task 03. Stop and check the caps rather than discovering them as failures.
- A row fails and the tempting fix is to change the expectation. Record the finding; the expectation is the spec.

# Completion Criteria

The state is `INTEGRATION CERTIFIED` when:

- The capability matrix has been **regenerated from the current repository** — not copied from this file — and every row has a recorded result: PASS with evidence, N/A with a reason, or FAIL with a decision.
- **The certified commit SHA and deployment identifier are recorded at the head of the evidence log**, and the deployed build still matches them at the end of the pass.
- Gmail rows are **certified, not N/A** — Task 14 is a prerequisite, so "Gmail untested" is not an acceptable outcome of this task.
- All seven whole-workflow scenarios executed on production with evidence.
- **W4 (scheduled → AI → Gmail Send, browser closed) passed**, with the fire time recorded against the schedule. Without it, unattended operation is unproven, and unattended operation is the product's riskiest mode.
- **W6 (scheduled failure) passed** — the failure was persisted, visible in history, and observable in the reporter. Certification requires that failures are *visible*, not that they never happen.
- Idempotency proven in production for both Gmail and HTTP (rows 26, 33): a replayed claim produced **no** second external action.
- Redaction proven against stored rows (row 37).
- Restricted Gmail actions confirmed unreachable via both the dropdown and a crafted graph (row 27).
- Every failure recorded with a severity and an explicit decision.
- All manual actions logged in `RELEASE_PROGRESS.md` with dates — never as agent-completed work.

`INTEGRATION CERTIFIED` asserts the V1 capabilities work in production, **on the recorded commit**. It asserts nothing about visual quality or UX — that is Task 16.

**This completion is terminal.** Reaching it ends the task; there is no second pass. A deploy landing afterwards does not reopen this task — it fails Task 17 Gate 6, and the delta re-verification is recorded there.

# Manual / External Steps

1. **Create a dedicated production test account.** Not your personal account. Row 57 deletes it.
2. **Create a second test account** for the RLS isolation checks (row 5) — cross-user tests need two real users.
3. **Use your own address for every send.** W2 and W4 both send real email.
4. **Stand up the controlled HTTP endpoint** you own, that logs received headers and bodies.
5. **Record W4's evidence yourself**: the schedule's `next_run_at`, the actual fire time, the run row, and the received email. The system cannot attest that your browser was closed.
6. **Check the Google permissions page** for rows 30 and 57 — the app cannot verify revocation for you.
7. **Watch provider spend** during certification. Test runs cost real money against the production keys and count toward the Task 03 caps.
8. **Clean up** test workflows, schedules, files, and runs afterward — but **only after** all evidence is recorded. Deleting the artifact is deleting the proof.
