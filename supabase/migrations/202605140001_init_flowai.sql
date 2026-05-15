create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists workflows_user_id_idx on public.workflows (user_id);
create index if not exists workflows_updated_at_idx on public.workflows (updated_at desc);

drop trigger if exists workflows_set_updated_at on public.workflows;
create trigger workflows_set_updated_at
before update on public.workflows
for each row
execute function public.set_updated_at();

alter table public.workflows enable row level security;

drop policy if exists "Users can select their own workflows" on public.workflows;
create policy "Users can select their own workflows"
on public.workflows
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own workflows" on public.workflows;
create policy "Users can insert their own workflows"
on public.workflows
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own workflows" on public.workflows;
create policy "Users can update their own workflows"
on public.workflows
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own workflows" on public.workflows;
create policy "Users can delete their own workflows"
on public.workflows
for delete
using (auth.uid() = user_id);
