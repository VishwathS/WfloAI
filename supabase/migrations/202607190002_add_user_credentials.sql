-- Encrypted per-user credentials for the HTTP Request node.
-- secret_encrypted holds the lib/crypto.ts envelope of a JSON payload:
--   bearer  → {"token": "..."}
--   basic   → {"username": "...", "password": "..."}
--   api_key → {"headerName": "x-api-key", "value": "..."}
-- Secrets are write-only: no API route ever returns decrypted values.
create table if not exists public.user_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('bearer', 'basic', 'api_key')),
  secret_encrypted text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists user_credentials_user_id_idx
  on public.user_credentials (user_id);

drop trigger if exists user_credentials_set_updated_at on public.user_credentials;
create trigger user_credentials_set_updated_at
before update on public.user_credentials
for each row
execute function public.set_updated_at();

alter table public.user_credentials enable row level security;

drop policy if exists "Users can select their own credentials" on public.user_credentials;
create policy "Users can select their own credentials"
on public.user_credentials
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own credentials" on public.user_credentials;
create policy "Users can insert their own credentials"
on public.user_credentials
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own credentials" on public.user_credentials;
create policy "Users can update their own credentials"
on public.user_credentials
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own credentials" on public.user_credentials;
create policy "Users can delete their own credentials"
on public.user_credentials
for delete
using (auth.uid() = user_id);
