-- Idempotency ledger for external side effects (Gmail send/draft/reply,
-- mutating HTTP requests). The unique idempotency_key plus atomic claim
-- (insert-on-conflict-do-nothing, conditional failed→pending reclaim) is the
-- duplicate-execution protection; result_output/result_metadata hold the
-- already-redacted node result so a replayed claim can return it without
-- re-executing the external action. Never store tokens, credentials, raw
-- request headers, or unredacted responses here.
create table if not exists public.integration_action_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  run_id uuid not null,
  node_id text not null,
  action_type text not null,
  idempotency_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'unknown')),
  external_result_id text,
  result_output text,
  result_metadata jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists integration_action_executions_run_node_idx
  on public.integration_action_executions (run_id, node_id);

-- Serves the per-user quota window queries.
create index if not exists integration_action_executions_quota_idx
  on public.integration_action_executions (user_id, action_type, created_at);

drop trigger if exists integration_action_executions_set_updated_at on public.integration_action_executions;
create trigger integration_action_executions_set_updated_at
before update on public.integration_action_executions
for each row
execute function public.set_updated_at();

alter table public.integration_action_executions enable row level security;

drop policy if exists "Users can select their own integration actions" on public.integration_action_executions;
create policy "Users can select their own integration actions"
on public.integration_action_executions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own integration actions" on public.integration_action_executions;
create policy "Users can insert their own integration actions"
on public.integration_action_executions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workflows
    where id = workflow_id
    and user_id = auth.uid()
  )
);

drop policy if exists "Users can update their own integration actions" on public.integration_action_executions;
create policy "Users can update their own integration actions"
on public.integration_action_executions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own integration actions" on public.integration_action_executions;
create policy "Users can delete their own integration actions"
on public.integration_action_executions
for delete
using (auth.uid() = user_id);
