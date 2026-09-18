# Objective

Represent the explicit, human-authorized transition from launch-ready to publicly available V1.

Entry state: `HUMAN ACCEPTED` (Task 16). Exit state: `READY FOR HUMAN GO-LIVE`, and then — **only after a human acts** — `LIVE`.

The desired pre-launch state is:

```
READY FOR HUMAN GO-LIVE
```

and explicitly **not**:

```
the agent decided to launch
```

Everything in this task up to the launch action is inspection, aggregation, and preparation. The launch action itself is a human's, always. This is the one task in the plan whose central deliverable is a **decision brief**, not a change.

# Audit Items

**LAUNCH-17** — a launch-extension ID, not an original audit ID.

Closes the operator side of **A3** (enabling public signup is the launch action itself) and depends on every preceding task. It introduces no new audit findings.

**Prerequisites:** Tasks 01–16, each either complete or explicitly accepted as out of scope for this release with a recorded reason.

# Current State

### The go-live action is not one action

"Launching" is at minimum: removing or widening Task 08's signup gate, having Task 14's Google verification approved so non-test users can connect Gmail, and pointing real people at the production URL. Each has a different owner, a different reversal cost, and a different failure mode:

| Component | Reversible? | Reversal |
|---|---|---|
| Removing the signup gate (Task 08) | Yes, quickly | Re-enable the gate. Accounts already created persist |
| Google consent screen published / verified (Task 14) | Awkwardly | Unpublishing strands connected users |
| Announcing the URL publicly | **No** | You cannot un-tell people |
| Production deploy of a new build | Yes | Roll back to the prior deployment |
| Applying a migration | **Usually not** | Requires a written-in-advance down path, or restore from backup |

Treating these as a single switch is the mistake this task exists to prevent.

### There is no rollback procedure written down anywhere

`grep -niE "vercel|deploy|hosting"` across `README.md`, `CLAUDE.md`, and `.env.local.example` returns nothing, and the repository contains no host configuration, no runbook, and no incident procedure. Whatever rollback capability exists is a property of the host, not of this project — **and untested**.

An untested rollback is not a rollback. That is what makes rollback rehearsal a gate here rather than a suggestion.

**Task 13 closes this gap, not Task 17.** Task 13 authors `docs/RUNBOOK.md` — the rollback/recovery procedure and the minimal support/incident path. This task **verifies** that document and rehearses what can be safely rehearsed. Keeping the author and the gate separate is the point: a gate that checks its own output checks nothing.

### There is no health endpoint yet

Task 13 decides the health-check approach, and its stated preference is **no new route** — driving an existing authenticated route with a real session. The alternative, a deliberately bare unauthenticated `/api/health`, requires a **second** documented exception to CLAUDE.md's "every `app/api/` route authenticates" invariant and is taken only if readiness cannot otherwise be verified. The post-launch smoke test in §Smoke test depends on whichever was chosen — confirm which before writing the smoke procedure, and do not assume a health endpoint exists.

### Irreversibility is asymmetric, and the asymmetry favours waiting

Nearly every gate below can be re-checked tomorrow at no cost. Public availability cannot be withdrawn once people have arrived. A gate that is "probably fine" is a gate that has not been checked.

# Required Changes

## 1. Autonomous — readiness inspection and aggregation

All of this is safe. None of it changes production.

- [ ] **Aggregate task status** from `RELEASE_PROGRESS.md` and, where verifiable, from the repository itself. `RELEASE_PROGRESS.md` is a record of claims; the repository is evidence. Where they disagree, report the disagreement — do not reconcile it silently.
- [ ] **Compile every outstanding `BLOCKED` item and every unperformed manual/external action** across Tasks 01–16 into one list, each with its blocking task and what would unblock it. This list is the core of the launch report.
- [ ] **Compile the accepted-defect list** from Task 16 into a known-issues section. Every defect knowingly shipped belongs in writing before launch, not in a support ticket after.
- [ ] **Run the safe verification suite**: `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint`. Confirm the deployed commit matches the reviewed commit.
- [ ] **Verify production health non-invasively**: `curl -I` the canonical origin, confirm security headers, confirm the auth gate still redirects, confirm the unsigned-POST rejection at `/api/inngest` still holds. Read-only, repeatable, and cheap.
- [ ] **Confirm Task 15's certification is still current** — that no deploy has landed since. A certification predating the deployed build certifies a different product.
- [ ] **Prepare the exact launch commands and click-paths** for the human to execute, in order, with the expected result of each. Prepare; do not run.
- [ ] **Verify Task 13's `docs/RUNBOOK.md` rather than writing it.** Task 13 authors the rollback/recovery procedure and the support/incident path; this task confirms the document exists, that it is still accurate against the environment actually deployed (host, origin, provider accounts, gate mechanism), and that its "cannot be rolled back" list is present. Assemble it into the launch report. If it is missing or stale, that is a Task 13 defect to record — do not write a competing second procedure here.
- [ ] **Write the post-launch smoke-test checklist** (§Smoke test), matched to the health-check approach Task 13 chose.
- [ ] **Produce the launch report** (§Launch report) and hand it over. **Then stop.**

## 2. Launch gates

Every gate is **PASS**, **FAIL**, or **WAIVED (with a recorded reason and a named person)**. A waiver is a legitimate decision; an unexamined gate is not.

| # | Gate | Passes when |
|---|---|---|
| 1 | **Hardening** | Tasks 01–12 complete, or explicitly waived with a reason. Task 01's A4/A5/A13/A15 and Task 06's Next.js upgrade are the ones not to waive — EOL framework plus middleware-as-auth-gate is a direct compromise path |
| 2 | **Production deployment** | Task 13 `COMPLETE`; production evidence table fully recorded |
| 3 | **Inngest signing key** | Unsigned POST to production `/api/inngest` **rejected**, `INNGEST_DEV` **absent** from production, event publishing separately confirmed. Three distinct results (MASTER §4.1) |
| 4 | **Google OAuth** | Task 14 complete; Sensitive-scope verification **approved in the Console** — not merely submitted; consent screen published; a fresh non-test account has connected in production |
| 5 | **Gmail scope** | `gmail.send` only. No Restricted scope in the Console. Create Draft / Find / Read / Reply unreachable via dropdown **and** executor |
| 6 | **Production E2E** | Task 15 `INTEGRATION CERTIFIED`, including **W4** (scheduled → AI → Gmail Send, unattended) and **W6** (scheduled failure observable). **The deployed commit matches the commit Task 15 certified.** If a deploy landed since, this gate holds FAIL until the affected capabilities are re-verified and that delta is recorded *here* — Task 15 is not reopened |
| 7 | **Human UI acceptance** | Task 16 `HUMAN ACCEPTED`, zero open Blockers, accepted defects listed |
| 8 | **Legal** | Privacy policy and terms published at stable URLs, **DRAFT banner removed**, human legal review recorded, registered in the OAuth configuration. Retention periods in the policy **match the code** (Task 12 / B2) |
| 9 | **Cost controls** | Provider budget caps set on the **production** keys; durable per-user AI/Lookup quotas (Task 03) live; per-run and schedule caps (Tasks 04, 05) live. Uncapped spend plus open signup is the one failure that scales without you |
| 10 | **Observability** | Task 02 live in production; a deliberately triggered error reached the reporter; failed scheduled runs are distinguishable |
| 11 | **Signup gating decision** | The scope of launch is **explicitly decided** — fully open, invite-only, or capped — with a number, not a vibe. **A per-user cost figure from Task 03's unit-cost method is recorded, with its basis stated** — either *estimated* (Task 03's pre-launch estimate, derived at Task 03 time from quota ceilings, representative local/test metering and published provider prices) or *measured* (real production usage). Task 03 produces the estimate without waiting on beta or certification traffic; this gate owns the measured figure. A spend cap is not this number: the cap bounds the worst case, the unit cost is what an admitted user actually costs, and the admission decision needs the second one. An estimate is an acceptable basis for a capped or invite-only launch; **widening to open signup needs the measured figure** (see Manual Step 11) |
| 12 | **Account deletion** | Task 09 shipped and verified on a test account, or explicitly waived. Note the dependency: the privacy policy promises deletion, and **not honoring a published promise is an FTC Section 5 problem** independent of statutory thresholds |
| 13 | **Rollback** | Task 13's `docs/RUNBOOK.md` rollback/recovery section **exists, has been reviewed against the deployed environment, and has been rehearsed to the extent safely possible** without taking an unauthorized production action. An unrehearsed rollback is a hypothesis — but rehearsal is not a licence to breach §7.1, so anything that could not be safely rehearsed is **named explicitly with the reason**, rather than silently counted as rehearsed |
| 14 | **Data safety** | Backups enabled and retained; `INTEGRATION_TOKEN_KEY` backed up in two places and **restore-tested** |
| 15 | **Support path** | Task 13's `docs/RUNBOOK.md` support/incident section **exists**, and: the contact route is live, monitored by a named person, and matches the address published in the privacy policy (Task 07); the containment switches are written down as specific actions; and the incident-capture list is present. This gate checks that the path exists and is watched — it is not a requirement to have built a support platform |
| 16 | **Smoke test ready** | §Smoke test written and matched to the Task 13 health-check decision |

**Dependency ordering** — no cycles:

```
Gates 1–2  →  Gate 3
Gate 2     →  Gate 4  →  Gate 5
Gates 2,4  →  Gate 6  →  Gate 7
Gates 6,7  →  Gates 8–16  →  LAUNCH (human)
```

Deferred **D1** (Gmail restricted scopes / CASA) is **not a gate** and must never become one. V1 is Send-only by decision. Any reading of Gate 4 or 5 that implies restricted-scope approval is a misreading — Gate 5 passes precisely *because* no Restricted scope is present.

## 3. The launch action — human only

The agent stops at `READY FOR HUMAN GO-LIVE` and hands over the report. The human then, in order:

1. Confirms every gate is PASS or consciously WAIVED.
2. Executes the launch action (removing or widening the gate, per Gate 11's decision).
3. Runs the smoke test.
4. Records the outcome.

## 4. Post-launch smoke test

Minimal, fast, and repeatable. Run immediately after launch, then again after ~1 hour, then after ~24 hours — the 24-hour run is the one that catches a scheduled workflow failing in production for the first time.

| # | Check | Expected |
|---|---|---|
| 1 | Health signal (per Task 13's decision) | Healthy |
| 2 | Landing page loads signed out | 200, no console errors |
| 3 | Legal pages load | 200, no draft banner |
| 4 | Signed-out `/`, `/workflows/<id>`, `/settings` | All redirect to `/login` |
| 5 | Security headers on production | All present |
| 6 | Unsigned POST to `/api/inngest` | Rejected |
| 7 | Sign in with a real account | Succeeds |
| 8 | Run a simple workflow (Input → AI → Action) | Completes; run row persisted |
| 9 | A scheduled workflow fires on time | `workflow_runs` row with `trigger: "scheduled"` |
| 10 | Gmail Send to your own address | Delivered |
| 11 | Error reporter receiving events | Visible |
| 12 | Provider spend against the caps | Within expectation |
| 13 | New-signup count | Matches the launch scope decided in Gate 11 |

Any failure in 1–6 is a **rollback trigger**, not a bug to triage: those are the checks that say the environment itself is wrong.

# Verification

**Automated (safe, pre-launch)**

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` all green.
- [ ] Deployed commit matches the reviewed commit.
- [ ] Read-only production health checks pass (headers, auth gate, unsigned-POST rejection).
- [ ] Every gate has a recorded PASS / FAIL / WAIVED, with waivers naming a person.

**Human (launch and after)**

- [ ] Launch report reviewed by a human.
- [ ] The launch action performed **by a human**.
- [ ] Smoke test run immediately, at ~1 hour, and at ~24 hours, each recorded.
- [ ] The first real external signup observed end to end.

# Stop Conditions

Hard stops. The agent **must not** do any of the following without explicit authorization under MASTER §7.1, and must not infer authorization from a gate reading PASS:

- **Deploy to production.**
- **Enable public signup, remove gating, or widen access** — this *is* the launch action.
- **Change production infrastructure.**
- **Apply a remote or production migration.**
- **Publish unreviewed legal text**, or remove a `DRAFT — NOT REVIEWED BY COUNSEL` banner. Banner removal is a legal sign-off, not a formatting change.
- **Modify Google production configuration**, or submit/resubmit verification.
- **Create, expose, replace, or rotate any secret.**
- **Change provider billing or budget settings.**
- **Perform any irreversible production data change.**
- **Send real email** outside the tester's own address.

Additionally, stop and ask if:

- Any gate is FAIL and the proposed path forward is to waive it **without a named person accepting it**. Silent waivers defeat the entire gate structure.
- Task 15's certification names a commit other than the one currently deployed. Re-verify the affected capabilities and **record that delta under Gate 6 here** — do not extrapolate, and do not reopen Task 15, which has one completion event.
- **Google verification is submitted but not approved.** Gate 4 requires approval visible in the Console. Do not launch Gmail to real users on an unapproved submission, and do not record approval that has not happened.
- Rollback has been written but never rehearsed, **and no reason is recorded for why rehearsal was not safely possible**. "We didn't get to it" is not that reason.
- Task 13's `docs/RUNBOOK.md` does not exist, or its support/incident section is missing. Gates 13 and 15 both depend on it, and writing it here instead would put the gate and the gated work in the same hands.
- Launching would exceed the deliberate cap in Gate 11.
- Anything suggests launching "to see what happens". The gates exist because the reverse action does not.

# Completion Criteria

### `READY FOR HUMAN GO-LIVE` — the agent's terminal state

- Every gate recorded PASS / FAIL / WAIVED, with waivers naming a person and a reason.
- Zero FAIL gates without an accepted waiver.
- Launch report delivered: status summary, outstanding blockers, known issues from Task 16, the exact launch steps, Task 13's rollback and support/incident procedures, and the smoke-test checklist.
- Task 13's rollback procedure **verified present, reviewed, and rehearsed to the extent safely possible**, with what cannot be rolled back stated explicitly and anything unrehearsable named with its reason.
- Task 13's support/incident path verified present, with the contact route live, monitored by a named person, and matching the published privacy policy.
- A per-user cost figure recorded with its basis (estimated or measured), per Gate 11.
- Safe verification green; deployed commit matches reviewed commit.
- **The agent has stopped and handed over.** This is the correct and complete outcome of the task for an autonomous agent. Reaching it is success, not an incomplete result.

### `LIVE` — only a human can reach this

- A human performed the launch action and recorded it in `RELEASE_PROGRESS.md` with a date.
- Smoke test passed immediately after launch.
- Smoke test passed again at ~1 hour and at ~24 hours, with the 24-hour run confirming at least one **scheduled** run succeeded in the open product.
- First real external signup observed end to end.
- Spend within the Task 03 caps over the first 24 hours.
- No rollback trigger fired.

# Manual / External Steps

1. **Review the launch report end to end.** It is the decision document; skimming it defeats the purpose.
2. **Decide the launch scope explicitly** (Gate 11): open, invite-only, or capped — with a number.
3. **Rehearse the rollback before launching**, not after something goes wrong.
4. **Confirm Google verification is approved in the Console**, not merely submitted.
5. **Confirm the legal DRAFT banners are removed** and that the removal followed an actual human legal review.
6. **Perform the launch action yourself.**
7. **Run the smoke test** at launch, +1 hour, and +24 hours.
8. **Watch provider spend** for the first 24 hours against the Task 03 caps. Open signup plus real users is the first time the cost model meets reality.
9. **Watch the error reporter** for the first day — a scheduled workflow failing every morning is exactly the failure Task 02 exists to make visible, and the first morning after launch is when you find out whether it worked.
10. **Record the launch** and the smoke-test results in `RELEASE_PROGRESS.md` with dates.
11. **Re-measure per-user cost after real usage, before widening signup.** Gate 11 accepts an *estimate* for a capped or invite-only launch, because a pre-launch estimate is the best evidence that exists. **The measurement horizon is bounded by retention:** Task 12 sweeps settled ledger rows 30 days past settlement, so the measured figure is a **rolling window of at most the last 30 days of retained raw rows**, taken before cleanup removes older ones. Do not describe it as covering a longer period than that, and if a longer baseline is ever needed, capture periodic aggregates rather than lengthening retention. Once real users have generated real traffic, re-run Task 03's unit-cost query over a representative period, record the **measured** cost per active user per month alongside the estimate, and treat any widening of the signup gate as a decision that needs the measured number — not the estimate. This is the evidence MASTER §4 Phase 3 means by "per-user cost is a number you know". **If sufficient measured usage does not exist when the launch decision is taken, say so explicitly and put the decision to a human on the basis of the estimate, with its limitations restated.** Recording an estimate as though it were measured, or inferring a measured figure from too small a sample, is the one outcome this step exists to prevent.
