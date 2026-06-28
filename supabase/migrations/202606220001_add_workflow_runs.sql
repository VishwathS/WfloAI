create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  final_output text,
  node_outputs jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workflow_runs_workflow_id_idx
on public.workflow_runs (workflow_id);

create index if not exists workflow_runs_user_id_idx
on public.workflow_runs (user_id);

create index if not exists workflow_runs_created_at_idx
on public.workflow_runs (created_at desc);

alter table public.workflow_runs enable row level security;

drop policy if exists "Users can select their own workflow runs" on public.workflow_runs;
create policy "Users can select their own workflow runs"
on public.workflow_runs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workflow runs" on public.workflow_runs;
create policy "Users can insert their own workflow runs"
on public.workflow_runs
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workflows
    where id = workflow_id
    and user_id = auth.uid()
  )
);

drop policy if exists "Users can delete their own workflow runs" on public.workflow_runs;
create policy "Users can delete their own workflow runs"
on public.workflow_runs
for delete
using (auth.uid() = user_id);
