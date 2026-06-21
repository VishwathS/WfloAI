create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ran_at timestamptz not null default timezone('utc'::text, now()),
  node_results jsonb not null default '[]'::jsonb
);

create index if not exists execution_logs_workflow_id_idx
on public.execution_logs (workflow_id);

create index if not exists execution_logs_user_id_idx
on public.execution_logs (user_id);

create index if not exists execution_logs_ran_at_idx
on public.execution_logs (ran_at desc);

alter table public.execution_logs enable row level security;

drop policy if exists "Users can select their own execution logs" on public.execution_logs;
create policy "Users can select their own execution logs"
on public.execution_logs
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own execution logs" on public.execution_logs;
create policy "Users can insert their own execution logs"
on public.execution_logs
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own execution logs" on public.execution_logs;
create policy "Users can update their own execution logs"
on public.execution_logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own execution logs" on public.execution_logs;
create policy "Users can delete their own execution logs"
on public.execution_logs
for delete
using (auth.uid() = user_id);
