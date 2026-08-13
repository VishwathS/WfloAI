-- Security-relevant integration events. Never stores secret values.
-- Audit-insert failures are non-fatal in application code: a successful
-- external action must never be reported as failed because auditing failed.
create table if not exists public.integration_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  resource_id text,
  result text not null check (result in ('succeeded', 'failed', 'blocked', 'unknown')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists integration_audit_events_user_idx
  on public.integration_audit_events (user_id, created_at);

alter table public.integration_audit_events enable row level security;

drop policy if exists "Users can select their own audit events" on public.integration_audit_events;
create policy "Users can select their own audit events"
on public.integration_audit_events
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own audit events" on public.integration_audit_events;
create policy "Users can insert their own audit events"
on public.integration_audit_events
for insert
with check (auth.uid() = user_id);
