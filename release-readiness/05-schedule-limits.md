# Objective

Prevent scheduled automation from becoming an unbounded, unattended spend channel, and stop broken schedules from failing silently forever. A user can currently create a `* * * * *` schedule; the poller's global `.limit(50)` means fifty of those is 72,000 runs per day against the operator's shared Anthropic key.

# Audit Items

**A12** (schedule and runtime limits)

# Current State

`app/api/workflows/[id]/schedules/route.ts:118` accepts **any expression `cron-parser` can parse**, including `* * * * *`. There is no minimum-interval floor.

There is **no per-user or per-workflow schedule cap**. `checkDueSchedules` in `lib/inngest/functions.ts` has a global `.limit(50)` — that is a throughput ceiling on the poller, not a per-user quota, and treating it as one would be a mistake.

When a scheduled run fails, `runScheduledWorkflow` persists a `status: "error"` row and `next_run_at` advances normally. There is **no auto-disable and no notification**. A scheduled Gmail workflow that starts erroring keeps erroring on schedule, notifying nobody, indefinitely.

What already works and must not be weakened: the CAS claim in `checkDueSchedules` (`UPDATE … WHERE id = ? AND next_run_at = <observed> AND enabled`) is the only duplicate-run protection in the system. CLAUDE.md lists it as non-negotiable. Any change in this area must preserve exactly-one-winner semantics.

# Required Changes

- [x] Enforce a **minimum interval floor** on schedule creation and update in `app/api/workflows/[id]/schedules/route.ts`. The audit suggests 15 minutes as reasonable for V1. Validate the parsed cron, not the raw string — `*/1 * * * *` and `* * * * *` must both be rejected.
- [x] Enforce a **per-user schedule cap** (and consider a per-workflow cap). Return a clear error naming the limit when exceeded.
- [x] Add a **consecutive-failure counter** to `workflow_schedules` via migration. Increment on an error run; reset on success.
- [x] **Auto-disable** a schedule after N consecutive failures, and **notify the owner**. Both halves matter — disabling without telling anyone converts a loud problem into a quiet one.
- [x] Surface the disabled state and the reason in `components/canvas/WorkflowSettingsSidebar.tsx`, so the user can see why their automation stopped and re-enable it deliberately.
- [x] Preserve the CAS claim semantics in `checkDueSchedules` unchanged. If the failure counter requires touching that UPDATE, treat exactly-one-winner as the invariant to protect.

# Implementation record (2026-09-15)

## Done

- **Interval floor, 15 minutes**, enforced on create *and* update. `meetsIntervalFloor` in `lib/schedule/cron.ts` measures gaps between **parsed** occurrences, not the raw string, so every spelling of every-minute is rejected. It samples six consecutive gaps and takes the smallest, because one pair can hide a short one: `0,1,30 * * * *` looks like 29 minutes if you only look once. Tested.
- **Per-user cap (20) and per-workflow cap (5)** on the create route, each with an error naming the limit. The poller's global `.limit(50)` is left alone: it is a throughput ceiling on the poller, not a per-user quota.
- **Failure counter migration** `202609150003` adds `consecutive_failures` and `disabled_reason`. Written and reviewed locally; **not applied remotely**.
- **Auto-disable** in a new `track-schedule-health` Inngest step: any success resets the counter; the Nth consecutive failure sets `enabled = false`, `next_run_at = null` and a stable `disabled_reason`.
- **Notification via Task 02's reporter**, not a second path. The step calls `reportError("schedule.auto_disabled", ...)`. Task 02's facade already exists, so this sequences behind it exactly as the Stop Condition requires; it becomes a real alert the moment the operator registers a transport.
- **UI**: the Workflow Settings sidebar shows an amber panel on an auto-disabled schedule naming the failure count and telling the user to check Run History and re-enable deliberately. Re-enabling clears the counter and the reason, so restarting is a deliberate act.

## CAS semantics: demonstrably unchanged

`git diff` on `lib/inngest/functions.ts` for this task contains **zero deleted lines** - every change is an addition. The claim

```
UPDATE workflow_schedules SET ... WHERE id = ? AND next_run_at = <observed> AND enabled
```

is byte-identical. The health counter is updated in its own step *after* the run, never folded into the claim. `tests/scheduleLimits.test.ts` also pins the claim predicate (exactly one concurrent winner; a disabled row is never claimed; a stale `next_run_at` loses) so a future edit cannot quietly widen it.

## Deferred / outstanding

- **Pre-existing sub-floor schedules are NOT touched.** The floor applies to create and update only. Retroactively disabling working automation is a product decision and an explicit Stop Condition. Whether any exist can only be answered against the real database - **operator action**.
- **Values are PROPOSED**: floor 15 min (the audit's suggestion), 20 schedules/user, 5/workflow, disable after 5 consecutive failures. Stop Conditions make these the operator's call - Manual Steps 1 and 2.
- **End-to-end notification cannot be verified** until Task 02's transport is registered, which is blocked on the operator's vendor/DSN decision. The disable half is verifiable without it.
- The route-level tests the Verification section asks for (creating a schedule returns 400 / cap exceeded) need a live database and an HTTP harness; the pure logic they would exercise is unit-tested instead, and the DB-level assertions are recorded as outstanding rather than faked.

# Verification

**Automated**

- [x] `npm test` green.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [ ] Test: creating a `* * * * *` schedule returns `400`. Also test `*/5 * * * *` against the chosen floor, and a valid expression at exactly the floor.
- [ ] Test: creating one schedule beyond the per-user cap returns a clear error.
- [x] Test: N consecutive error runs disables the schedule; a success in between resets the counter.
- [x] A test asserting the CAS claim still yields exactly one winner under simulated concurrent polls.

**Manual**

- [ ] Create a schedule at the floor and confirm it runs on time in a real environment.
- [ ] Deliberately break a scheduled workflow, let it fail N times, and confirm it auto-disables **and** that the notification actually arrives. Depends on task 02's notification channel.
- [ ] Confirm the disabled state is visible and explicable in the Workflow Settings sidebar.
- [ ] Confirm existing schedules created before the floor was introduced behave sensibly — see Stop Conditions.

# Stop Conditions

Stop and ask before proceeding if:

- Existing schedules in the database violate the new floor. Retroactively disabling a user's working automation is a product decision, not a cleanup step.
- The migration for the failure counter would need to be applied to a remote or production database. Create and review locally; do not push.
- Choosing N (the failure threshold) or the cap values requires product judgment. Propose and ask.
- The notification mechanism does not exist yet because task 02 has not landed. Do not invent a second notification path — sequence behind task 02 or ask.
- Any change would alter the CAS claim's exactly-one-winner behavior. Stop.

# Completion Criteria

- Minimum interval floor enforced on both create and update, validated against the parsed cron.
- Per-user schedule cap enforced with a clear error.
- Failure counter migration written, reviewed, and recorded as not yet applied remotely.
- Auto-disable **and** owner notification both working, verified end to end with a real failing schedule.
- Disabled state visible in the UI with its reason.
- CAS semantics demonstrably unchanged.
- All three verification commands green; `git diff` reviewed.

# Manual / External Steps

1. **Decide the minimum interval** for V1. 15 minutes is the audit's suggestion; the right number depends on what you want the product to be.
2. **Decide the per-user schedule cap** and the consecutive-failure threshold N.
3. **Apply the failure-counter migration** to the remote database once reviewed.
4. **Decide what to do about pre-existing sub-floor schedules**, if any exist in production.
