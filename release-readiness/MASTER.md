# WfloAI — Public V1 Release Hardening

## 1. What this is

This directory is the execution plan for getting WfloAI from its current state to a public V1 where strangers can sign up and use the product.

It is derived from the **Public V1 Launch Readiness Audit (v2)**. The audit is a **dated snapshot**. This repository is the truth. Every task file below contains a `# Current State` section describing what the audit found — if the code no longer matches that description, update the section and say so rather than implementing against a stale premise.

The audit's finding was that WfloAI's *hard* security primitives are in good shape and should not be rebuilt — the SSRF guard (`lib/http/ssrfGuard.ts`), AES-256-GCM secret storage (`lib/crypto.ts`), the idempotency ledger (`lib/integrations/idempotency.ts`), redaction (`lib/integrations/redact.ts`), and RLS across all nine tables. The gaps are in the operational, legal, and cost layer *around* those primitives.

**Nothing in this plan has been implemented.** All tasks start at `NOT STARTED` in `RELEASE_PROGRESS.md`.

---

## 2. Execution order

```
01-security-sweep        →  02-observability      →  03-ai-lookup-quotas
04-runtime-limits        →  05-schedule-limits    →  06-nextjs-upgrade
07-landing-legal         →  08-signup-gating      →  09-account-deletion
10-gmail-consent         →  11-production-config  →  12-ci-docs-retention
```

Three deviations from strict sequence:

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

Open signup once quota enforcement has survived real load and per-user cost is a number you know.

### Phase 4 — Post-V1 backlog

C1–C10, D2, D3, D4, and the full D1 restricted-scope program. Nothing here blocks V1. Decide on Gmail restricted scopes — now including Create Draft — only after Phase 3, weighing the security-assessment burden and recurring cost.

---

## 5. Minimum Public V1 Gate

The smallest set before strangers create accounts (= everything through Phase 2).

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
