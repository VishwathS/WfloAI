-- Gmail OAuth connections — one per user (unique user_id).
-- refresh_token_encrypted / access_token_encrypted use the lib/crypto.ts
-- versioned AES-256-GCM envelope; plaintext tokens are never stored.
create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'requires_reconnect')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id)
);

drop trigger if exists gmail_connections_set_updated_at on public.gmail_connections;
create trigger gmail_connections_set_updated_at
before update on public.gmail_connections
for each row
execute function public.set_updated_at();

alter table public.gmail_connections enable row level security;

drop policy if exists "Users can select their own gmail connections" on public.gmail_connections;
create policy "Users can select their own gmail connections"
on public.gmail_connections
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own gmail connections" on public.gmail_connections;
create policy "Users can insert their own gmail connections"
on public.gmail_connections
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own gmail connections" on public.gmail_connections;
create policy "Users can update their own gmail connections"
on public.gmail_connections
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own gmail connections" on public.gmail_connections;
create policy "Users can delete their own gmail connections"
on public.gmail_connections
for delete
using (auth.uid() = user_id);
