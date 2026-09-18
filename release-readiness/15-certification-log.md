# Task 15 — Production certification log

**Status: NOT STARTED — prerequisites unmet.** Prepared 2026-09-17 from the
repository at `87a4ea6`. This is the skeleton the single certification pass
fills in; it is not evidence of anything yet.

## Certified build

| Field | Value |
|---|---|
| `CERTIFICATION_COMMIT` | *(set at pass start — must equal the deployed SHA)* |
| Vercel deployment id | *(from Vercel)* |
| Canonical origin | `https://<CANONICAL_HOST>` — not chosen |
| Deployed SHA at pass start | — |
| Deployed SHA at pass end | — (must equal the start value) |
| Supabase production project | — (DEPLOYMENT.md §1 decision) |

**If the deployed SHA differs from `CERTIFICATION_COMMIT` at any point, stop.**
Rows completed before the change are re-run against the new build within this
pass.

## Prerequisites — all must hold before row 1

| Prerequisite | State on 2026-09-17 (release resume) |
|---|---|
| Task 13 `PRODUCTION READY` | **No** — no Vercel project (creation checkpoint, DEPLOYMENT.md §6); dev/prod separated (Dev `ureajvxesvmehlxlrboy`); production migration-ledger repair verified-ready, blocked on CLI auth |
| Task 14: a fresh non-test account can connect Gmail | **Not yet proven** — fixed in code (`fee570c`: `openid email gmail.send`, address from OIDC userinfo; stubbed-Google tests green). Needs deployment and the real fresh-account test |
| Task 14: consent screen out of Testing, or the cert account is a listed test user | Unknown — Console state is not visible to the agent |
| Controlled HTTP endpoint (owned, public, logs headers and bodies) | Not set up |
| Two dedicated production test accounts (A, B), admitted via invite | Not created |
| Error reporter (Task 02) | **No vendor** — see row 51 |
| Provider caps on production keys (Task 03) | Not confirmed |

## Side-effect policy

Real email only to the tester's own address. HTTP only to the owned endpoint.
Account deletion only on test account A, at the very end. No production
reconfiguration to make a row pass — a failing row is a finding.

## Fixtures (operator prepares; not committed)

| Fixture | How |
|---|---|
| Small TXT | any short text file |
| Text PDF | print any text page to PDF |
| CSV | a few rows |
| Scanned/image PDF (negative) | a photo or screenshot saved as PDF |
| Oversize | `fsutil file createnew big.pdf 22000000` (Windows) — above the 20 MB document cap in `lib/files/constants.ts` |

## Legend

**Auto** = assertable against production by an agent, read-only (curl, Vercel
logs, Supabase MCP). **Manual** = needs a human, a browser or an inbox. Result ∈
PASS · FAIL (+ severity + decision) · N/A (+ reason) · NOT RUN · BLOCKED.

## Capability matrix (regenerated from the repository)

Source of truth: `nodeTypes` in `components/canvas/WorkflowCanvas.tsx` (9 types),
`NODE_CARDS` in `NodeSidebar.tsx` (8 draggable — **Trigger has no card**), the 21
routes under `app/api/`, the 9 pages under `app/`, the 15 templates in
`lib/templates/definitions.ts`, and Gmail actions in `lib/gmail/scopes.ts` (Send
only; four restricted actions gated). Tasks 07–12 all shipped, so their
conditional capabilities are rows to test (1a, 23a, 24a, 30a, 45a, 57–60), not N/A.

### Authentication, admission, account

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 1 | Google sign-in (fresh account) | New `auth.users` + unapproved `profiles` row; lands on `/waitlist` | Manual | Row ids (MCP) | NOT RUN |
| 1a | Invite redemption (Task 08) | Valid code → approved → `/dashboard`; bad code → error; 6th attempt in 15 min → 429 | Manual + Auto | `profiles.approved`, `invite_redemption_attempts` | NOT RUN |
| 1b | Existing approved user | Straight to `/dashboard` | Manual | — | NOT RUN |
| 2 | Auth gate | Signed-out `/dashboard`, `/settings`, `/workflows/<id>` → 307 `/login`; `/`, `/privacy`, `/terms`, `/help` → 200 | Auto | `curl -I` per path | NOT RUN |
| 3 | Open-redirect guard | `/auth/callback?next=//example.com` stays on origin | Auto | `Location` header | NOT RUN |
| 4 | Sign out | Gated page → `/login` after sign-out | Manual | trace | NOT RUN |
| 5 | RLS isolation | B → A's workflow, run, file, credential, schedule: 404/403 each | Manual (two sessions) | per-resource response | NOT RUN |

### Workflow lifecycle

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 6 | Create | Row created, canvas opens | Manual | workflow id | NOT RUN |
| 7 | Auto-save | One PATCH per settled change (700 ms debounce) | Manual | network trace + `graph` | NOT RUN |
| 8 | Reload fidelity | nodes, edges, values, `node.style` restored | Manual | before/after | NOT RUN |
| 9 | Rename | persisted; dashboard reflects it | Manual + Auto | row | NOT RUN |
| 10 | Delete (`DELETE /api/workflows/[id]`) | Row gone; runs/files/schedules cascade; **storage prefix swept first** | Manual + Auto | per-table counts + bucket listing | NOT RUN |
| 11 | Template → first run | Clone runnable after inputs filled | Manual | cloned graph | NOT RUN |

### Node execution

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 12 | Input | value reaches the AI prompt | Manual | run output | NOT RUN |
| 13 | Trigger (template/saved only — not draggable) | executes, passes through | Manual | run output | NOT RUN |
| 14 | File Input TXT | extracted text reaches AI | Manual | `workflow_files` row + run | NOT RUN |
| 15 | File Input PDF | extracted, `page_count` set | Manual | row | NOT RUN |
| 16 | File negative | scanned → 422; oversize → size error; **nothing persisted** | Manual + Auto | response + no row/object | NOT RUN |
| 17 | AI: Summarize/Rewrite/Classify/Extract/Generate | JSON matching each schema | Manual | parsed outputs | NOT RUN |
| 18 | Router AI | exactly one branch | Manual | node events | NOT RUN |
| 19 | Router deterministic | no router AI call | Manual + Auto | events; no router AI ledger row | NOT RUN |
| 20 | Lookup (Tavily) | results flow downstream | Manual | run output | NOT RUN |
| 21 | Action | no `Structured output:` prefix in stored `final_output` | Auto | `workflow_runs.final_output` | NOT RUN |
| 22 | Variables | `{{key}}`, `{{previousOutput}}` resolve; undefined var fails pre-run | Manual | error + output | NOT RUN |
| 23 | Validation | cycle / missing field / empty prompt → 400, **no spend** | Manual + Auto | responses + no ledger rows | NOT RUN |
| 23a | Caps (Tasks 03/04) | >20 AI nodes or >60 reachable nodes refused pre-run; AI 20/min quota → refusal | Manual + Auto | responses + ledger counts | NOT RUN |

### Integrations

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 24 | Gmail connect (fresh account) | connected; `scopes` has `gmail.send`, nothing Restricted | Manual + Auto | row (MCP) | **BLOCKED** (GOOGLE-OAUTH §0) |
| 24a | `?tier=read` refused | 403 while the flag is off | Auto (signed in) | response | NOT RUN |
| 25 | **Gmail Send** to own address | delivered, `From` = that user | Manual | message + run | NOT RUN |
| 26 | Gmail idempotency | replayed claim → no second email | Manual + Auto | ledger + inbox | NOT RUN |
| 27 | Restricted actions | absent from the dropdown **and** refused from a crafted graph | Manual + Auto | both | NOT RUN |
| 28 | Token refresh after expiry | transparent, one Google call | Manual | `access_token_expires_at` | NOT RUN |
| 29 | External revoke | `requires_reconnect`, clear message, no retry storm | Manual | row + UI | NOT RUN |
| 30 | Disconnect | row removed **and** grant gone at Google | Manual | permissions page | NOT RUN |
| 30a | Gmail quota display (Task 10) | Settings counts match the ledger after a send | Manual + Auto | UI + ledger | NOT RUN |
| 31 | HTTP GET | body flows downstream | Manual | run output | NOT RUN |
| 32 | HTTP POST | endpoint receives payload | Manual | endpoint log | NOT RUN |
| 33 | HTTP mutation idempotency | no duplicate at endpoint | Manual + Auto | endpoint log + ledger | NOT RUN |
| 34 | Stored credential (Bearer/Basic/API key) | right header arrives; secret never in stored output/history/ledger | Manual + Auto | endpoint log + stored rows | NOT RUN |
| 35 | Credential lifecycle | create / replace / delete-with-usage; no API returns a secret | Manual + Auto | responses | NOT RUN |
| 36 | SSRF guard | private/loopback/metadata target refused at connect | Manual | node error | NOT RUN |
| 37 | Redaction | echoed secret is `[REDACTED]` in **stored** rows | Auto | `node_outputs`, `result_output` | NOT RUN |

### Execution surface and history

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 38 | SSE streaming | progressive events | Manual | trace | NOT RUN |
| 39 | Long-run durability | completes, or a persisted error run — never no row | Manual + Auto | stream tail + row | NOT RUN |
| 40 | Client disconnect | defined behaviour recorded | Manual | row state | NOT RUN |
| 41 | Run history | newest-first; **Load older runs** pages (Task 12) | Manual | rows | NOT RUN |
| 42 | Run delete | row removed | Manual + Auto | response | NOT RUN |
| 43 | Error run | `status='error'`, first error captured | Auto | row | NOT RUN |

### Scheduling

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 44 | Create schedule | `next_run_at` correct for the timezone | Manual + Auto | row | NOT RUN |
| 45 | Cron validation | invalid → 400; <15 min → 400; >5/workflow or >20/user → 400 | Manual | responses | NOT RUN |
| 45a | Unattended-send consent (Task 10) | enabling a send-capable schedule without ack → refused; with ack → `unattended_send_authorized_at` set | Manual + Auto | response + column | NOT RUN |
| 46 | Run now | event published, run row | Manual + Auto | row | NOT RUN |
| 47 | **Real cron fire**, browser closed | fires within its minute, `trigger='scheduled'` | Manual + Auto | row vs `next_run_at` | NOT RUN |
| 48 | Exactly-once claim | one run per occurrence | Auto | run count | NOT RUN |
| 49 | Overdue | fires once, no backfill | Auto | run count | NOT RUN |
| 50 | Scheduled failure | error row; auto-disable after 5 consecutive failures (Task 05) with `disabled_reason` | Auto | rows + schedule | NOT RUN |
| 51 | Failure observable | `scheduled_run.failed` visible | Auto (Vercel runtime logs) | log line | NOT RUN — **no reporter vendor.** The structured stderr line in Vercel logs is agent-checkable; whether logs alone satisfy W6 is a Gate 10 decision for the operator |
| 52 | `input_values` | override applied; saved graph unchanged | Auto | output + graph | NOT RUN |
| 53 | Disable/delete | `next_run_at` null; no further runs | Auto | rows over time | NOT RUN |
| 54 | Latest-graph semantics; a graph save adding Gmail Send disables unconsented schedules | runs the latest graph; unconsented schedule disabled | Manual + Auto | output + schedule row | NOT RUN |

### Data lifecycle and public pages

| # | Capability | Expected | Kind | Evidence | Result |
|---|---|---|---|---|---|
| 55 | File replace/delete | old object removed | Manual + Auto | bucket listing | NOT RUN |
| 56 | Stale `fileId` | descriptive node error | Manual | error | NOT RUN |
| 57 | **Account deletion** (test account A, last) | no rows left for that user in any user-data table; no objects under the prefix; Google grant gone | Manual + Auto | per-table counts + bucket + permissions page | NOT RUN |
| 58 | Data export | JSON with workflows, schedules, runs; no secrets | Manual | file | NOT RUN |
| 59 | Landing / legal / help (Tasks 07, 12) | 200 signed-out; legal pages show the DRAFT banner until counsel review | Auto | `curl` | NOT RUN |
| 60 | Retention sweep (Task 12) | runs only if `RETENTION_CLEANUP_ENABLED=true`; boundaries honoured | Auto (Inngest + MCP) | function run + counts | NOT RUN |

## Whole-workflow scenarios

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| W1 | Input → AI (Summarize) → Action | NOT RUN | |
| W2 | Input → Lookup → AI (Rewrite) → **Gmail Send** (own address) | NOT RUN | |
| W3 | File (PDF) → AI (Extract) → **HTTP POST** (owned endpoint, stored credential) | NOT RUN | |
| W4 | **Scheduled → AI → Gmail Send, browser closed** | NOT RUN | |
| W5 | Input → AI (Classify) → Router (deterministic) → two branches | NOT RUN | |
| W6 | Scheduled workflow with a failing node | NOT RUN | |
| W7 | Input → AI → HTTP GET (credentialed) → AI | NOT RUN | |

## Findings

| # | Row | Severity | Finding | Decision |
|---|---|---|---|---|
| F1 | 24 | CRITICAL → fixed in code | A fresh `gmail.send`-only connect fails at `users.getProfile` (found in Task 14 prep, before certification) | Option A chosen and shipped in `fee570c`; must be **deployed** before this pass starts, and row 24 then certifies it against real Google |

## Result

`INTEGRATION CERTIFIED`: **No.**

## Pass record — 2026-09-18 (pre-pass: agent auto rows)

Deployed build `6a331b5`, deployment `dpl_5Lv1fmG7jiJ8LSmu1RihzrMY2yg3`, canonical origin `https://wfloai.vercel.app`, Supabase production `axelqoxblpchscksfwbx`. **Proposed `CERTIFICATION_COMMIT` = `6a331b5`.** The human pass runs against this SHA; later local commits are docs-only and are not deployed during the pass.

| # | Result | Evidence |
|---|---|---|
| 2 | **PASS** | signed-out `/dashboard`, `/settings`, `/waitlist`, `/workflows/<id>` → 307 `/login?next=…`; `/`, `/privacy`, `/terms`, `/help`, `/login` → 200 |
| 3 | **PASS (no-code path)** | `/auth/callback?next=` `//example.com`, `https://example.com`, `/\example.com` → 307 `https://wfloai.vercel.app/login?error=auth` |
| 59 | **PASS** | `/privacy`, `/terms`, `/help` 200 signed-out; DRAFT banner on `/privacy` and `/terms`; `vishwath@ucsb.edu` shown; no `<OPERATOR_NAME>` |
| 60 | **PASS (config)** | `RETENTION_CLEANUP_ENABLED` absent in Production; `cleanupExpiredData` returns `skipped` unless the flag is exactly `"true"` |

Prerequisites still open: Task 14 fresh non-test connect; controlled HTTP endpoint; test accounts A/B; error reporter (row 51 → Gate 10); provider caps.
