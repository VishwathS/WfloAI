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

- [ ] Enforce a **minimum interval floor** on schedule creation and update in `app/api/workflows/[id]/schedules/route.ts`. The audit suggests 15 minutes as reasonable for V1. Validate the parsed cron, not the raw string — `*/1 * * * *` and `* * * * *` must both be rejected.
- [ ] Enforce a **per-user schedule cap** (and consider a per-workflow cap). Return a clear error naming the limit when exceeded.
- [ ] Add a **consecutive-failure counter** to `workflow_schedules` via migration. Increment on an error run; reset on success.
- [ ] **Auto-disable** a schedule after N consecutive failures, and **notify the owner**. Both halves matter — disabling without telling anyone converts a loud problem into a quiet one.
- [ ] Surface the disabled state and the reason in `components/canvas/WorkflowSettingsSidebar.tsx`, so the user can see why their automation stopped and re-enable it deliberately.
- [ ] Preserve the CAS claim semantics in `checkDueSchedules` unchanged. If the failure counter requires touching that UPDATE, treat exactly-one-winner as the invariant to protect.

# Verification

**Automated**

- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.
- [ ] Test: creating a `* * * * *` schedule returns `400`. Also test `*/5 * * * *` against the chosen floor, and a valid expression at exactly the floor.
- [ ] Test: creating one schedule beyond the per-user cap returns a clear error.
- [ ] Test: N consecutive error runs disables the schedule; a success in between resets the counter.
- [ ] A test asserting the CAS claim still yields exactly one winner under simulated concurrent polls.

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
