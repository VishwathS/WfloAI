alter table public.workflow_runs
  add column "trigger" text check ("trigger" in ('manual', 'scheduled'));
