-- A14a, durable. Cross-task remediation for tasks 10 and 12.
--
-- Task 10 recorded unattended-send authorisation as a row in
-- integration_audit_events. Task 12 then gave that table a 90-day retention
-- sweep. The consequence is that after 90 days a schedule keeps sending mail on
-- its own timetable while the only record that anyone authorised it has been
-- deleted — the application could no longer answer "is this schedule allowed to
-- send unattended?" from its own data.
--
-- The operative state therefore lives on the schedule it governs. Audit events
-- remain the historical evidence of WHEN consent was given and by whom;
-- deleting one no longer changes what the application will do.
--
-- Additive only: one nullable column, no policy change, no data rewritten.
-- Existing rows get NULL, which reads as "not authorised" — the safe default.
-- No existing schedule is disabled by this migration; the application disables
-- an unauthorised send-capable schedule when it sees one (see
-- disableUnauthorizedSendSchedules in lib/schedule/consent.ts and the guard in
-- runScheduledWorkflow).
alter table public.workflow_schedules
  add column if not exists unattended_send_authorized_at timestamptz;

comment on column public.workflow_schedules.unattended_send_authorized_at is
  'A14a: when the owner authorised this schedule to send real email unattended. Null means not authorised. Set only on an explicit enable-time confirmation; cleared when the schedule is disabled for lacking consent. Never inferred.';

-- Reading it is enough; no new policy is needed. The existing per-user
-- workflow_schedules policies already scope every row to auth.uid(), and the
-- column is written only by the schedule routes (user-scoped, under those same
-- policies) and by the Inngest runner (service role).
