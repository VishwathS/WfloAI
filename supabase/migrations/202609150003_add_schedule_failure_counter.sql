-- A12 — a scheduled workflow that starts failing currently keeps failing on
-- schedule, notifying nobody, indefinitely. These columns let the runner
-- auto-disable it after a run of consecutive failures and say why.
--
-- Deliberately NOT touched: the CAS claim in checkDueSchedules
-- (UPDATE ... WHERE id = ? AND next_run_at = <observed> AND enabled). It is the
-- only duplicate-run protection in the system and CLAUDE.md lists it as
-- non-negotiable. The counter is updated in a separate statement after the run,
-- never folded into the claim, so exactly-one-winner semantics are unchanged.
alter table public.workflow_schedules
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists disabled_reason text;

comment on column public.workflow_schedules.consecutive_failures is
  'Consecutive error runs. Reset to 0 on any successful run.';
comment on column public.workflow_schedules.disabled_reason is
  'Why the schedule was auto-disabled; null when the user disabled it themselves.';
