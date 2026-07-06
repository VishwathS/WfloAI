-- Cron schedules for background workflow execution.
-- Future trigger types (webhook, gmail, slack, calendar) get their own tables.
-- Future: workflow_versions — schedules currently execute the latest saved graph;
-- pinning a schedule to a graph version would prevent silent behavior changes on edit.
create table if not exists public.workflow_schedules (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Schedule',
  enabled boolean not null default false,
  cron_expression text not null,
  timezone text not null default 'UTC',
  input_values jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workflow_schedules_due_idx
  on public.workflow_schedules (next_run_at)
  where enabled;

create index if not exists workflow_schedules_workflow_id_idx
  on public.workflow_schedules (workflow_id);

create index if not exists workflow_schedules_user_id_idx
  on public.workflow_schedules (user_id);

drop trigger if exists workflow_schedules_set_updated_at on public.workflow_schedules;
create trigger workflow_schedules_set_updated_at
before update on public.workflow_schedules
for each row
execute function public.set_updated_at();

alter table public.workflow_schedules enable row level security;

drop policy if exists "Users can select their own workflow schedules" on public.workflow_schedules;
create policy "Users can select their own workflow schedules"
on public.workflow_schedules
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workflow schedules" on public.workflow_schedules;
create policy "Users can insert their own workflow schedules"
on public.workflow_schedules
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workflows
    where id = workflow_id
    and user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own workflow schedules" on public.workflow_schedules;
create policy "Users can update their own workflow schedules"
on public.workflow_schedules
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workflows
    where id = workflow_id
    and user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own workflow schedules" on public.workflow_schedules;
create policy "Users can delete their own workflow schedules"
on public.workflow_schedules
for delete
using (auth.uid() = user_id);
