# WfloAI — Public V1 Release Hardening

## 1. What this is

This directory is the execution plan for getting WfloAI from its current state to a public V1 where strangers can sign up and use the product.

It is derived from the **Public V1 Launch Readiness Audit (v2)**. The audit is a **dated snapshot**. This repository is the truth. Every task file below contains a `# Current State` section describing what the audit found — if the code no longer matches that description, update the section and say so rather than implementing against a stale premise.

The audit's finding was that WfloAI's *hard* security primitives are in good shape and should not be rebuilt — the SSRF guard (`lib/http/ssrfGuard.ts`), AES-256-GCM secret storage (`lib/crypto.ts`), the idempotency ledger (`lib/integrations/idempotency.ts`), redaction (`lib/integrations/redact.ts`), and RLS across all nine tables. The gaps are in the operational, legal, and cost layer *around* those primitives.

**Nothing in this plan has been implemented.** All tasks start at `NOT STARTED` in `RELEASE_PROGRESS.md`.

### The plan covers seventeen tasks, in two halves

Tasks **01–12** are *release hardening* — they make the application safe to expose. Tasks **13–17** are the *launch lifecycle* — they establish production, release OAuth to real users, certify the deployed product, obtain human acceptance, and gate the go-live action itself.

Hardening alone is not a launch. A hardened repository that has never been deployed, whose OAuth only works for test accounts, whose scheduled workflows have never fired against Inngest Cloud, and that no human has looked at is not ready for strangers. Tasks 13–17 exist so that gap is represented rather than assumed.

### Six states, and what each does and does not assert

Progress is tracked as states, not percentages. **A state is never achieved on the basis that code exists.**

| State | Reached by | Asserts | Does **not** assert |
|---|---|---|---|
| `HARDENED` | Tasks 01–12 | The application's relevant hardening work is done and verified locally | That it is deployed, or that it works in production |
| `PRODUCTION READY` | Task 13 | The production environment exists and is correctly configured, with recorded evidence | That any workflow actually runs there |
| `INTEGRATION CERTIFIED` | Task 15 (needs Task 14) | The real V1 capabilities and representative whole workflows pass end-to-end **in production** | That the product looks or feels acceptable |
| `HUMAN ACCEPTED` | Task 16 | A person has worked through the UI/UX acceptance checklist and the fresh-user flow, and accepted the result | That every gate for launch is satisfied |
| `READY FOR HUMAN GO-LIVE` | Task 17 (agent's terminal state) | Every launch gate is PASS or consciously WAIVED; only the authorized launch action remains | That the product is live |
| `LIVE` | A **human** performs the launch action | Launch happened and post-launch smoke verification passed | — |

An agent can reach `READY FOR HUMAN GO-LIVE` and no further. Stopping there is the correct outcome, not an incomplete one.

---

## 2. Execution order

### Hardening (Tasks 01–12)

```
01-security-sweep        →  02-observability      →  03-ai-lookup-quotas
04-runtime-limits        →  05-schedule-limits    →  06-nextjs-upgrade
07-landing-legal         →  08-signup-gating      →  09-account-deletion
10-gmail-consent         →  11-production-config  →  12-ci-docs-retention
```

### Launch lifecycle (Tasks 13–17) — strictly sequential

```
          Tasks 01–12                RELEASE HARDENING
                 ↓                        → HARDENED
          Task 13                    PRODUCTION DEPLOYMENT
                 ↓                        → PRODUCTION READY
          Task 14                    GOOGLE / OAUTH PRODUCTION RELEASE
                 ↓
          Task 15                    PRODUCTION E2E CERTIFICATION
                 ↓                        → INTEGRATION CERTIFIED
          Task 16                    HUMAN LAUNCH ACCEPTANCE
                 ↓                        → HUMAN ACCEPTED
          Task 17                    GO-LIVE
                 ↓                        → READY FOR HUMAN GO-LIVE
        [human acts]                      → LIVE
```

Unlike 01–12, **these five do not reorder.** Each consumes the verified output of the one before it: certifying a production environment that does not exist, or accepting a UI whose flows have not been certified, produces a result that means nothing. Full dependency detail is in §8.

Three deviations from strict sequence, all within 01–12:

1. **The manual console items come first.** The provider budget caps in task 03 and the Inngest / Supabase / key-backup items in task 11 are sub-hour actions that do not require code. They cap the worst case before any code lands. Do them on day one regardless of where the numbered sequence stands.
2. **Task 06 (Next.js upgrade) is the longest pole.** Start it early and let it run alongside the documentation-heavy tasks (07, 12). It should not be the thing that blocks the Google OAuth submission.
3. **Task 01 genuinely goes first among code tasks.** It is six small diffs with no design decisions, and it contains A15, which changes what the rest of the Gmail plan even is.

Work **one numbered task at a time**. Each is an independently reviewable unit.

---

## 3. Audit item coverage

### 3.0 ID-space corrections — read this before auditing coverage

The audit's ID space is **not contiguous**. These gaps are real and intentional; nothing was lost during consolidation:

| Correction | Detail |
|---|---|
| **There is no `B4`** | The audit runs B3 → B5. The ID was never assigned. |
| **There is no bare `A14`** | A14 was split during the v2 re-tiering into **A14a** (schedule-send consent — blocker) and **B14b** (manual-run confirmation — recommended). |
| **`A15` exists** | Added in v2. The `gmail.compose`-is-a-Restricted-scope finding. It is outside any assumed A1–A14 range and is the highest-leverage sub-hour item in the whole audit. |
| **C items were unnumbered** | The audit lists them as bullets. This plan assigns **C1–C10** in source order so they are addressable from the backlog. |

### 3.1 Tier A — launch blockers

| ID | Summary | Destination |
|---|---|---|
| A1 | No Privacy Policy, Terms, or public homepage | `07-landing-legal.md` |
| A2 | No rate limiting on `/api/execute` and `/api/lookup` — unbounded spend | `03-ai-lookup-quotas.md` |
| A3 | Open signup with zero gating | `08-signup-gating.md` |
| A4 | `/settings` not protected by middleware | `01-security-sweep.md` |
| A5 | Protocol-relative open redirect in the OAuth callback | `01-security-sweep.md` |
| A6 | Security headers and CSP *(re-tiered to B)* | `01-security-sweep.md` (split: headers Phase 1 / CSP Phase 3) |
| A7 | Minimum observability | `02-observability.md` |
| A8 | No account deletion or data export | `09-account-deletion.md` |
| A9 | Next.js 14.2.35 is end-of-life | `06-nextjs-upgrade.md` |
| A10 | Inngest signing key unset/unverified | `11-production-config.md` |
| A11 | Execution timeouts and caps *(re-tiered to B)* | `04-runtime-limits.md` (split: `maxDuration` Phase 1 / rest Phase 2) |
| A12 | Schedule and runtime limits | `05-schedule-limits.md` |
| A13 | Idempotency-ledger UPDATE policy *(re-tiered to B)* | `01-security-sweep.md` |
| A14a | Consent for schedule-enabled Gmail sends | `10-gmail-consent.md` |
| A15 | Drop `gmail.compose` from the initial connect tier | `01-security-sweep.md` |

### 3.2 Tier B — strongly recommended for V1

| ID | Summary | Destination |
|---|---|---|
| B1 | Provider disclosures (Anthropic, Tavily) + AI-disclosure line | `07-landing-legal.md` |
| B2 | Retention policy | `12-ci-docs-retention.md` |
| B3 | CSRF posture (`Origin` check helper) | `01-security-sweep.md` |
| ~~B4~~ | **Does not exist** — see §3.0 | — |
| B5 | Supabase production config | `11-production-config.md` |
| B6 | Google Cloud production setup | `11-production-config.md` (manual/external) |
| B7 | CI and dependency hygiene | `12-ci-docs-retention.md` |
| B8 | README is materially stale | `12-ci-docs-retention.md` |
| B9 | `INTEGRATION_TOKEN_KEY` backup procedure | `11-production-config.md` (manual/external) |
| B10 | Help docs and onboarding | `12-ci-docs-retention.md` |
| B11 | Non-atomic quota checks | `03-ai-lookup-quotas.md` |
| B14b | Manual-run confirmation for send-capable graphs | `10-gmail-consent.md` |

### 3.3 Tier C — deferred post-V1 backlog

**Do not implement any C item during V1 hardening.** Numbering assigned by this plan; summaries and effort estimates carried from the audit.

| ID | Summary | Effort |
|---|---|---|
| C1 | Mobile/responsive. 20 breakpoint usages app-wide; the canvas has one. Desktop-only is defensible for V1 — but add an explicit "desktop recommended" notice on small screens rather than shipping a silently broken canvas. | Half day for the notice; multi-day to fix |
| C2 | Accessibility. 19 `aria-*` total, zero `role=`, no skip link, no focus trap. A drag-and-drop canvas is genuinely hard; a keyboard-navigable dashboard/settings is the realistic first step. | Multi-day |
| C3 | Zod validation. `isValidGraph` (`app/api/workflows/[id]/route.ts:11`) only checks `nodes`/`edges` are arrays — node contents are unvalidated at write time. | 1–2 days |
| C4 | Pagination on run history. | <1 hour |
| C5 | Toast system. Errors surface inline and inconsistently. | Half day |
| C6 | `execution_logs` dead table — unreferenced; drop or document. | <1 hour |
| C7 | Key rotation (`v2:` envelope path + re-encrypt sweep). | 1–2 days |
| C8 | Storage orphan cleanup for deleted workflows. | Half day |
| C9 | E2E tests (Playwright). | Multi-day |
| C10 | Workflow versioning. CLAUDE.md flags that schedules run the *latest saved graph*, so an edit silently changes automation behavior. Worth doing before schedules get heavy use. | Multi-day |

### 3.4 Tier D — feature-specific, deferred

| ID | Summary | Destination |
|---|---|---|
| D1 | Gmail restricted scopes | **Split.** The only V1 work — keep `GMAIL_READ_ACTIONS_ENABLED=false` and verify it in production — is in `10-gmail-consent.md`. The CASA security assessment, Letter of Assessment, annual re-assessment, and the four Limited Use requirements stay in §6 backlog. **Scope changed in audit v2: per A15, `gmail.compose` is Restricted, so Create Draft belongs here too.** |
| D2 | Public / shareable workflow links | §6 backlog. Do not build during V1. |
| D3 | Payments | §6 backlog. Forward-referenced from `03-ai-lookup-quotas.md` — A2's metering table should be shaped so it can be billed from later. |
| D4 | Additional integrations (Slack, Drive, Calendar, webhooks) | §6 backlog. |

### 3.5 Launch-extension IDs — `LAUNCH-13` … `LAUNCH-17`

Tasks 13–17 were added after the audit and carry **launch-extension IDs**, not audit IDs. They are a separate ID space:

- They **do not** change the meaning or the task mapping of any A, B, C, or D item. §3.1–§3.4 above remain exactly as they were.
- They **do not** introduce new audit findings. They represent lifecycle stages that the audit did not cover because the audit scoped *what to fix*, not *how to ship*.
- Where a launch task completes the operator side of an existing audit item, that is stated in the task file and the original item keeps its original home.

| Launch ID | Task file | Lifecycle stage | Completes the operator side of |
|---|---|---|---|
| `LAUNCH-13` | `13-production-deployment.md` | Production deployment | A10, B5, B9, and the non-Gmail half of B6 |
| `LAUNCH-14` | `14-google-oauth-production.md` | Google / OAuth production release | The Google half of B6 (supersedes task 11's §Google Cloud manual steps 12–19); external half of A15 |
| `LAUNCH-15` | `15-production-integration-e2e.md` | Production E2E certification | — (new; **C9 Playwright suite stays deferred**) |
| `LAUNCH-16` | `16-launch-acceptance.md` | Human launch acceptance | — (new; C1/C2/C5 are *recorded*, not fixed) |
| `LAUNCH-17` | `17-go-live.md` | Go-live | A3's launch action (enabling public signup) |

**Deferred work stays deferred.** In particular, the full **D1** restricted-scope program — CASA security assessment, Letter of Assessment, annual re-assessment, Limited Use requirements — is **not** a prerequisite of any launch task and must never become one. V1 Gmail is `gmail.send` only, and Task 14's Gate-5 check passes *because* no Restricted scope is present.

---

## 4. Launch sequence: Phase 0 → Phase 4

Preserves the audit's three release stages, with a pre-flight phase for the manual actions and a terminal phase for the deferred backlog.

### Phase 0 — Pre-flight (manual, no code, ~2 hours total)

Do these before any code task. None of them depend on the repo.

- Provider budget caps in the Anthropic and Tavily consoles (task 03, manual half). Converts the worst case from unbounded to a number you chose.
- Both Inngest keys set in production, **and the signing key verified by POSTing unsigned to `/api/inngest`** (task 11 / A10). The two keys are not interchangeable — see §4.1.
- `INTEGRATION_TOKEN_KEY` backed up in a password manager *and* the host's secret store (task 11 / B9).
- Supabase production checklist: Pro plan, MFA, SSL enforcement, CAPTCHA, `workflow-files` bucket confirmed private (task 11 / B5).

#### 4.1 `INNGEST_SIGNING_KEY` vs `INNGEST_EVENT_KEY` — distinct keys, distinct failure modes

These are frequently conflated. They protect opposite directions of traffic, and only one of them is what the unsigned-POST test validates.

| | `INNGEST_SIGNING_KEY` | `INNGEST_EVENT_KEY` |
|---|---|---|
| **Direction** | Inngest → your app | Your app → Inngest |
| **What it does** | Authenticates the serve endpoint at `app/api/inngest/route.ts`. Inngest signs each invocation request; the SDK verifies the signature and rejects unauthenticated requests in production. Also provides replay protection, and signs responses back to Inngest. | Authenticates your app when **publishing** events to Inngest — the `workflow/schedule.due` sends from `checkDueSchedules` and from the per-schedule "Run now" route. |
| **Failure mode if unset** | **Security.** The endpoint accepts unsigned requests. Since it triggers `runScheduledWorkflow`, which runs with the **service-role admin client**, forged `workflow/schedule.due` events could execute arbitrary users' workflows — including Gmail sends. Silent failure: nothing looks broken. | **Functional.** Event publishing is rejected, so schedules never fire and "Run now" fails. Loud failure: you notice immediately. |
| **Validated by the unsigned-POST test** | **Yes — this is the key that test exercises.** | No. A passing unsigned-POST test says nothing about the event key. |

Both must be set in production. Only the signing key is a security control, and it is the one whose absence is invisible — which is why A10's manual verification exists.

### Phase 1 — Production-safe private beta (5–10 people you know)

Deploy to the domain. Tasks: **01** (security sweep, incl. A15 and plain headers), **02** (observability), **04** (`maxDuration` half), **05** (schedule limits), **06** (Next.js upgrade), **11** (production config).

Google OAuth stays in **Testing** mode — the unverified-app user cap is a sufficient and appropriate gate here.

**Exit criteria:** run real scheduled workflows for a full week and watch the errors. Without task 02 you cannot tell whether this went well. This is where you learn whether the executor survives unattended operation.

### Phase 2 — Invite-only public beta (cap 50–100)

Tasks: **07** (homepage + policies), **08** (invite/waitlist + CAPTCHA), **09** (account deletion), **03** (durable quota code), **04** (remaining caps), **10** (A14a schedule-send consent), **11** (B6 Google Cloud production setup + **sensitive-scope submission for `gmail.send` only**).

Gmail read actions stay disabled. Strangers get in here, but only behind an invite gate. Cap at a number where you can personally read every error report.

### Phase 3 — Broader V1

Tasks: **01** (full CSP half), **12** (retention, CI, README, help docs), **10** (B14b manual-run confirmation, user-tested), **03** (B11 atomic quota checks), quota visibility in Settings.

Open signup once quota enforcement has survived real load and per-user cost is a number you know. That number is not a vibe and it is not the spend cap: **task 03 owns the unit-cost measurement method** (§Half 3) and **task 17 Gate 11** is where the figure must be recorded with its basis stated. A cap bounds the worst case; the unit cost is what an active user actually costs, and only the second one informs this decision.

### Phase 4 — Post-V1 backlog

C1–C10, D2, D3, D4, and the full D1 restricted-scope program. Nothing here blocks V1. Decide on Gmail restricted scopes — now including Create Draft — only after Phase 3, weighing the security-assessment burden and recurring cost.

### 4.5 Where Tasks 13–17 sit in the phase sequence

The Phase 0–4 sequence above is preserved unchanged. Tasks 13–17 were not in it because the audit assumed deployment and OAuth release as background activities rather than gated work. They are not a sixth phase — they **run within** the existing phases, and this is where:

| Task | Phase | Why there |
|---|---|---|
| **13** Production deployment | **Phase 1 entry** | Phase 1 opens with "deploy to the domain". Task 13 *is* that step, made explicit and evidence-bearing. Phase 1's hardening tasks (01, 02, 04, 05, 06, 11) must land **before** it, not alongside |
| **14** Google OAuth production release | **Phase 2** | Phase 2 already carries B6 and the sensitive-scope submission. Task 14 owns that work end to end and supersedes task 11's §Google Cloud manual steps so there is one owner, not two |
| **15** Production E2E certification | **Phase 2, after Tasks 13 and 14** | The single authoritative certification of the full V1 capability set, Gmail included. It cannot run earlier without recording Gmail as untested, which would not be a certification of V1. Phase 1's exit criterion is unchanged — the private-beta soak, observed through Task 02 — and is **not** Task 15 |
| **16** Human launch acceptance | **End of Phase 2** | Immediately before strangers arrive. Running it earlier accepts a UI that later tasks will change |
| **17** Go-live | **Phase 2 → Phase 3 boundary** | The transition from invite-gated to broader availability *is* the launch action. Phase 3's items (full CSP, retention, CI, README, help docs, B14b, B11) continue after it |

Two consequences worth stating plainly:

1. **Task 15 runs exactly once.** It is one authoritative pass over the full V1 capability set, performed after Tasks 13 and 14 have satisfied its prerequisites, and it certifies a **named commit** deployed to production. Its completion means `INTEGRATION CERTIFIED` and is not reopened. If a deploy lands after certification, that is handled at **Task 17 Gate 6** as a recorded delta re-verification of the affected capabilities — not by reopening a `COMPLETE` Task 15.
2. **Phase 1's "deploy to the domain" is not a free action.** It requires Task 13's evidence table, and Task 13 in turn requires Task 04's `maxDuration` on the execute route. Deploying before that produces a production-only truncation whose symptom is a missing `workflow_runs` row.

---

## 5. Minimum Public V1 Gate

The smallest set before strangers create accounts (= everything through Phase 2).

**This gate is necessary, not sufficient.** It enumerates the *hardening* required before strangers create accounts. Launch additionally requires `PRODUCTION READY`, `INTEGRATION CERTIFIED`, `HUMAN ACCEPTED`, and every gate in §8.3 — a fully checked table below still leaves a product that has never been deployed, certified, or looked at.

| # | Task | Audit ID | Task file | Effort |
|---|---|---|---|---|
| 1 | Public homepage + Privacy Policy + Terms/AUP + login consent line | A1 | 07 | 1–2 days |
| 2 | Durable per-user AI/Lookup quotas + **provider budget caps** | A2 | 03 | 1–2 days |
| 3 | Invite/waitlist gating + Supabase CAPTCHA | A3 | 08 | half day |
| 4 | `/settings` auth coverage + open redirect fix | A4, A5 | 01 | <1 hour |
| 5 | Inngest **signing key** set **and verified** in production | A10 | 11 | <1 hour |
| 6 | Upgrade off EOL Next 14 | A9 | 06 | 2–4 days |
| 7 | Account deletion | A8 | 09 | 1 day |
| 8 | Gmail read actions OFF **and `gmail.compose` removed from initial tier** | D1, A15 | 10, 01 | <1 hour |
| 9 | Minimum observability — failed scheduled runs + backend exceptions | A7 | 02 | half day |
| 10 | Schedule minimum interval + cap + auto-disable; `maxDuration` | A12, A11 | 05, 04 | half day–1 day |
| 11 | Ledger UPDATE policy dropped | A13 | 01 | <1 hour |
| 12 | Schedule-enable consent for send-capable workflows | A14a | 10 | half day |
| 13 | Plain security headers (CSP deferred) | A6 | 01 | 20 min |
| 14 | `INTEGRATION_TOKEN_KEY` backed up | B9 | 11 | <1 hour |

**~2–2.5 weeks of focused solo work**, plus Google sensitive-scope verification running in parallel (~10 days review, longer with back-and-forth).

---

## 6. Deferred post-V1 backlog

Preserved so nothing is lost. **Do not implement these during V1 hardening.** If a V1 task appears to require one of these, that is a signal to stop and ask — not to expand scope.

- **C1–C10** — see §3.3 for the full list with effort estimates.
- **D1 (full program)** — Gmail restricted scopes. Requires a security assessment by a Google-empanelled assessor under CASA, a Letter of Assessment, and **re-assessment every 12 months**. Restricted verification takes several weeks; assessments carry real recurring cost (commonly four figures at Tier 2). Also requires meeting the four **Limited Use** requirements: use data only for user-facing features prominent in the UI; no transfers except narrow exceptions; no humans reading the data except with affirmative consent / security / legal; and never transfer to advertisers or data brokers, or use for ads, credit assessment, or lending. State the Limited Use commitment in the privacy policy. **Per A15 this now gates Create Draft as well as Find/Read/Reply.**
- **D2 (public / shareable workflow links)** — the audit's answer to "should workflows with external side-effect nodes ever be anonymously executable?" is **no**. An anonymous visitor triggering a Gmail Send node sends mail as the owner, from the owner's account, using the owner's tokens. No rate limit fixes this, because the problem is not volume — the *authorization* is the owner's and the *intent* is a stranger's. Defensible design: public links execute only AI/Input/Lookup/Action nodes; any graph containing Gmail send/reply or credential-bearing HTTP is **ineligible for sharing entirely** — not opt-in-able, not warning-gated — enforced statically at share time *and* at execution time. Also needs per-link rate limits, IP-based limiting, owner-visible usage + kill switch, CAPTCHA, and an answer to who pays for the AI. Revisit only after A2 is durable.
- **D3 (payments)** — Stripe, plan/quota tiers, tax, refund policy in ToS, PCI scope (minimal with Checkout). Not needed for a free V1, but A2's metering table is the foundation — build it in a shape you can bill from.
- **D4 (additional integrations)** — Slack, Drive, Calendar, webhooks. Each brings its own OAuth verification and per-provider policy. **Check each scope's sensitive-vs-restricted classification in the Cloud Console, not from prose — A15 is the cautionary tale.** The `lib/integrations/repo.ts` pattern and the ledger generalize well. `workflow_webhooks` needs unauthenticated-endpoint abuse controls; D2's reasoning applies.

---

## 7. Global agent rules

These apply to every numbered task.

- **Inspect the current repository before implementing a task.** The audit is a snapshot and the code may have changed. If reality diverges from `# Current State`, update that section and say so rather than implementing against a stale description.
- **Work on only one numbered task at a time.**
- **Do not broaden scope.** A finding discovered mid-task that belongs to a different task gets recorded in that task's file — not fixed here.
- **Make the smallest changes necessary.**
- **Add or update tests appropriate to the change.**
- **Run relevant targeted tests during implementation**, not only at the end.
- **Before completing a task, run all three:**
  ```
  npm test
  npx tsc --noEmit
  npm run build
  ```
- **Review `git diff` before completion.**
- **Never commit secrets, tokens, credentials, or `.env.local`.**
- **Keep each numbered task as an independently reviewable unit.**
- **Update `RELEASE_PROGRESS.md` after each completed task.**
- **Record manual/external actions separately** rather than pretending they were completed.
- **A task must not be marked complete when required verification has failed.**

### 7.1 Hard stops — stop and ask before

- applying or pushing a Supabase migration to a remote/production database
- deploying to production
- changing production infrastructure
- creating, exposing, replacing, or rotating secrets
- modifying Google Cloud production settings
- modifying Anthropic/Tavily production billing or budget settings
- enabling public signup
- enabling Gmail restricted/read scopes
- submitting Google OAuth verification
- making irreversible production data changes
- sending real email during testing
- materially inventing or changing legal claims without review

**Additional hard stops introduced by Tasks 13–17.** These exist because those tasks operate *near* production by design, and the distance between "verifying production" and "changing production" is one command:

- **removing, widening, or bypassing signup gating** — this is the launch action itself (Task 17), and it is never an agent's to take
- **removing a `DRAFT — NOT REVIEWED BY COUNSEL` banner**, or publishing legal text — banner removal is a legal sign-off, not a formatting change
- **recording a Google verification as approved** when the Console does not show approval — a submission receipt is not an approval
- **registering, altering, or removing an OAuth redirect URI, authorized domain, consent-screen field, or scope**
- **requesting, adding, or justifying any Gmail Restricted scope** (`gmail.compose`, `gmail.readonly`, or any other), including "temporarily so Create Draft works" — that is the deferred D1 program
- **running `supabase db push` or any equivalent from this working copy**, which contains a live CLI project link (`supabase/.temp/linked-project.json`) and therefore targets a **remote** project by default
- **reconfiguring production to make a test pass** — if certification fails, the finding is the output, not a config change
- **running an autonomous screenshot, computer-use, or browser-vision loop for visual QA** — deliberately excluded from the release loop; visual judgement is the human's (see §7.6)
- **marking a lifecycle state achieved** on the basis that the code exists, rather than on recorded evidence

### 7.2 Database changes

The agent **may** create a migration file in `supabase/migrations/` and test/review it against a local database. The agent **must not** apply it to a remote or production database without explicit approval.

### 7.3 External configuration

For any task requiring changes in the Anthropic console, Tavily console, Google Cloud Console, Supabase dashboard, Inngest Cloud, or the deployment host: **document the exact steps in the task file's `# Manual / External Steps` section and stop.** Do not claim an external action was performed.

### 7.4 Legal documents

The agent may draft legal pages based on the audit, but every such page must carry this banner as its first rendered content:

```
> **DRAFT — NOT REVIEWED BY COUNSEL.** Do not publish without human legal review.
```

Legal claims must not be invented or materially altered without review. See `07-landing-legal.md`.

### 7.5 Planning and verification never become production actions

Tasks 13–17 are the tasks most likely to blur this line, because their subject *is* production. The rule is structural, and every one of those task files repeats it:

Each of Tasks 13–17 separates its work into four kinds, and the agent may perform exactly one of them:

| Kind | Who | Examples |
|---|---|---|
| **Autonomous work** | Agent | Repository edits, generating inventories and checklists from the code, preparing commands and click-paths, aggregating status |
| **Verification** | Agent for read-only checks; human for anything requiring a console, an inbox, or eyes | `curl -I`, response assertions, test runs; Console screenshots, received email, permissions pages |
| **Manual / external actions** | Human only | Deploying, applying migrations, setting secrets, Console changes, provider settings, the launch action |
| **Hard stops** | Nobody, without explicit authorization | §7.1 |

Two derived rules:

- **Read-only verification against production is permitted and encouraged.** `curl -I` on a public URL, an unsigned POST expecting rejection, and asserting a redirect are safe, repeatable, and cheap. What is forbidden is *changing* anything to make them pass.
- **Preparation is not permission.** An agent that has written the exact deploy command, confirmed every gate PASS, and produced the launch report has finished its job. It hands over. A gate reading PASS is not authorization, and neither is a complete-looking checklist.

**A staging environment is not a V1 prerequisite, and no task may introduce one as a blocker.** Several behaviors in this product only exist in production — platform function timeouts, cold starts, exact-match OAuth origins, Inngest Cloud cron timing, token refresh after real elapsed time. For those, **controlled production certification using designated test accounts and test data is the accepted V1 method**, and Task 15 is built around it. This is a statement about where verification happens, not a relaxation of anything: every §7.1 hard stop applies to a production test exactly as it applies to any other production contact, and "it was only a test" never authorizes a deploy, a migration, a secret, a console change, or mail to a third party. If a check genuinely cannot be performed safely against production with test accounts, the finding is that it cannot be verified in V1 — not that staging must be built first.

### 7.6 UI verification is split deliberately

Automated agents verify what is programmatically assertable: structural behavior, application state, types, tests, builds, routing, persistence, integration behavior, RLS, API contracts. When making UI changes, Claude's obligation is **preservation** — keep CLAUDE.md's design-system conventions and keep existing end-to-end UI flows intact, both of which are checkable from code.

Visual quality, layout, hierarchy, copy, discoverability, and whether a flow *feels* broken are checked by a **human, once, near the end** — Task 16. Autonomous screenshot, computer-use, and browser-vision loops are not part of the release loop: they are slow and expensive relative to what they catch, and they are not a substitute for a person looking at the product. If a check can only be answered visually, it belongs on Task 16's human checklist, not in an agent loop.

### 7.7 Test scope is bounded — this is a release, not a test-suite rewrite

The repository's existing coverage is nine Vitest files over `lib/` pure functions, with **zero tests touching any API route, middleware, auth, or RLS** (task 12 / B7 records this). That is a real gap, and it is **not a launch blocker**. It does not authorize a broad new testing initiative, and no task may become one.

Ownership is fixed and does not expand:

| Who | What |
|---|---|
| **Each implementing task (01–11)** | Focused regression tests for **what that task changes** — the specific behavior it introduces or fixes, where a test is practical. Each task's `# Verification` section already names these; do not add more |
| **Task 12** | The CI/test **harness** (B7): lint, `typecheck`, and `test` running on pull requests. It provides the machinery that makes the other tasks' tests meaningful. It does **not** backfill coverage for untested existing code |
| **Task 15** | Actual **production E2E certification** by defined scenario with recorded evidence |
| **C9 (deferred)** | An automated browser suite (Playwright). Stays in the Phase 4 backlog |

Sparse coverage discovered mid-task is recorded, not fixed. If writing tests starts to look like the task rather than part of it, that is the signal to stop and ask.

---

## 8. Launch lifecycle — Tasks 13–17

### 8.1 What each task is for

| Task | Purpose | Terminal state |
|---|---|---|
| **13** `13-production-deployment.md` | Establish and verify the real production environment, with recorded evidence rather than configuration documentation. **Also authors the V1 operations runbook** — rollback/recovery and the minimal support/incident path — which Task 17 later verifies rather than writes | `PRODUCTION READY` |
| **14** `14-google-oauth-production.md` | Make Gmail usable by real admitted users, not only developer/test Google accounts. **`gmail.send` only** | — (feeds 15) |
| **15** `15-production-integration-e2e.md` | Prove the deployed product works: a repo-derived capability matrix plus seven whole-workflow scenarios, on production. **One pass, one completion event**, against a named commit | `INTEGRATION CERTIFIED` |
| **16** `16-launch-acceptance.md` | Human UI/UX acceptance checklist and fresh-user flow. Agent prepares; human accepts | `HUMAN ACCEPTED` |
| **17** `17-go-live.md` | Aggregate gates, prepare launch and rollback, hand over | `READY FOR HUMAN GO-LIVE` → `LIVE` (human) |

### 8.2 Dependencies — explicit, acyclic

```
Tasks 01–12 ──────────────────► Task 13 ──► Task 14 ──► Task 15 ──► Task 16 ──► Task 17 ──► [human] LIVE
   (04 maxDuration)                 │          │           │           │            │
   (11 repo-side config)            │          │           │           │            │
   (01 A15 scope fix) ──────────────┼──────────┘           │           │            │
   (07 published legal URLs) ───────┼──────────┘           │           │            │
   (10 read-flag off) ──────────────┘                      │           │            │
   (02 observability) ──────────────────────────────────── ┘           │            │
   (09 account deletion) ────────────────────────────────── ┘          │            │
   (03 quotas, 05 schedule caps) ───────────────────────────────────── ┴────────────┘
```

Stated as rules:

- **Production E2E cannot complete before the production environment exists.** Task 15 requires Task 13's `PRODUCTION READY`. Certifying a URL that does not exist is not certification.
- **Gmail production E2E depends on Task 14.** Task 14 is a hard prerequisite of Task 15, not a parallel track: because Task 15 runs once and runs after it, Task 15's Gmail rows are **certified, never N/A**. A Task 15 pass that records Gmail as untested is not `INTEGRATION CERTIFIED` — it is a signal that the task was started too early. (The N/A mechanism still applies to the conditional capabilities gated by Tasks 07, 08, 09, 10 and 12, which are recorded N/A with a reason and never silently omitted.)
- **Task 14 depends on Task 01's A15 change and on Task 13's canonical-origin decision.** Without A15, the submission is a Restricted-scope submission. Without the canonical origin, the redirect URI registered is the wrong one.
- **Task 14 depends on Task 07's published legal URLs**, which the Google OAuth configuration requires.
- **Launch acceptance depends on certification.** Task 16 requires Task 15 — accepting a UI whose flows have not been certified accepts an appearance, not a product.
- **Go-live depends on all preceding gates.** Task 17 requires Tasks 01–16 complete or explicitly waived by a named person.
- **Certification names a commit.** Task 15 certifies the specific commit that was deployed when it ran, and records that identifier. A deploy landing afterwards does not invalidate or reopen Task 15 — it fails **Task 17 Gate 6**, which requires the deployed commit to match the certified one. The remedy is a delta re-verification of the affected capabilities, recorded under Task 17. The arrow always points forward and Task 15 has exactly one completion event.
- **Deferred Gmail restricted scopes are not a prerequisite of anything.** D1 must never become a launch dependency. V1 is Send-only; Task 17's Gate 5 passes *because* no Restricted scope is present.

### 8.3 Launch gates

Full detail, including pass conditions, lives in `17-go-live.md`. Summary: **hardening · production deployment · Inngest signing key · Google OAuth approved · Gmail scope is send-only · production E2E · human UI acceptance · legal · cost controls · observability · signup-gating decision · account deletion · rollback rehearsed · data safety · support path · smoke test ready.**

Each is PASS, FAIL, or WAIVED. **A waiver requires a named person and a recorded reason** — an unexamined gate is not a waived gate. Zero FAIL gates without an accepted waiver is the condition for `READY FOR HUMAN GO-LIVE`.

### 8.4 The one thing an agent must never conclude

That the gates are satisfied and therefore the launch may proceed. Satisfying the gates produces `READY FOR HUMAN GO-LIVE`. The transition to `LIVE` is a human action, always, and reaching the handover point is the successful completion of Task 17 — not a partial result.
