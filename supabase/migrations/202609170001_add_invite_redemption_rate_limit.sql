-- A3 follow-up — durable attempt limiting on invite redemption.
--
-- The limit lives INSIDE redeem_invite_code, not in /api/invite/redeem. The
-- function is granted to `authenticated`, so any signed-in user can call it
-- directly through PostgREST with their own JWT and never touch the route. A
-- route-level limiter would only slow down people who use the form.
--
-- Additive: this migration creates one table and replaces the function body.
-- 202609160001 is already applied and is not edited.

-- One row per counted attempt. RLS on with a read-own policy only: there is no
-- insert, update or delete policy, so a client cannot write a row, backdate one
-- or delete its own history to reset the window. Rows are written only by the
-- security-definer function below.
--
-- Not the integration_action_executions ledger: its UPDATE policy lets a user
-- rewrite their own pending/failed rows (created_at included), which is
-- acceptable for settling a metered call but would reset an attempt window.
create table if not exists public.invite_redemption_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists invite_redemption_attempts_user_time_idx
  on public.invite_redemption_attempts (user_id, attempted_at desc);

alter table public.invite_redemption_attempts enable row level security;

drop policy if exists "Users can read their own invite attempts" on public.invite_redemption_attempts;
create policy "Users can read their own invite attempts"
on public.invite_redemption_attempts
for select
using (auth.uid() = user_id);

-- Limits: 5 attempts per 15 minutes and 20 per day, per user. Defined only
-- here — the caller cannot pass its own limits, because the caller may be a
-- direct RPC. A 128-bit code is not guessable at any rate; these exist so a
-- short, human-chosen code is not guessable either.
--
-- Everything before the counted attempt is unchanged in meaning: an already
-- approved caller returns early without burning an attempt or a use, and a
-- disabled code still reports 'invalid', so the outcomes reveal nothing new.
create or replace function public.redeem_invite_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code    public.invite_codes%rowtype;
  v_recent  integer;
  v_today   integer;
begin
  if v_user_id is null then
    return 'unauthenticated';
  end if;

  -- Serialises one user's concurrent attempts, so count-then-insert below is
  -- atomic: under READ COMMITTED two parallel calls could otherwise both count
  -- 4 and both proceed. Released at commit.
  perform pg_advisory_xact_lock(hashtext('invite_redeem:' || v_user_id::text));

  if exists (select 1 from public.profiles where user_id = v_user_id and approved) then
    return 'already_approved';
  end if;

  select
    count(*) filter (where attempted_at > now() - interval '15 minutes'),
    count(*)
  into v_recent, v_today
  from public.invite_redemption_attempts
  where user_id = v_user_id
    and attempted_at > now() - interval '1 day';

  -- A refused attempt is not recorded, so the window lapses on its own rather
  -- than a script extending its own lockout indefinitely.
  if v_recent >= 5 or v_today >= 20 then
    return 'rate_limited';
  end if;

  -- Recorded before the code is looked at, and the function returns rather
  -- than raises on every path, so the row commits whatever the outcome.
  insert into public.invite_redemption_attempts (user_id) values (v_user_id);

  -- Keeps the table bounded without a sweep: nothing older than the widest
  -- window is ever read.
  delete from public.invite_redemption_attempts
  where user_id = v_user_id
    and attempted_at <= now() - interval '1 day';

  -- The route caps length at 64; this is the same guard for a direct RPC.
  if p_code is null or length(p_code) > 128 then
    return 'invalid';
  end if;

  select * into v_code
  from public.invite_codes
  where code = trim(p_code)
  for update;

  if not found or v_code.disabled then
    return 'invalid';
  end if;

  if v_code.expires_at is not null and v_code.expires_at <= now() then
    return 'expired';
  end if;

  if v_code.uses >= v_code.max_uses then
    return 'exhausted';
  end if;

  update public.invite_codes
  set uses = uses + 1
  where code = v_code.code;

  insert into public.profiles (user_id, approved, approved_at, invite_code_used)
  values (v_user_id, true, now(), v_code.code)
  on conflict (user_id) do update
  set approved = true,
      approved_at = now(),
      invite_code_used = excluded.invite_code_used;

  delete from public.invite_redemption_attempts where user_id = v_user_id;

  return 'approved';
end;
$$;

-- Supabase's default privileges grant EXECUTE on new public functions directly
-- to anon, and `revoke ... from public` in the earlier migrations does not
-- remove a direct role grant. Neither function does anything for anon (both
-- resolve auth.uid() to null), but the intended grant set is authenticated
-- only, plus service_role for the quota function's scheduled path. These are
-- idempotent: revoking a grant that does not exist is a no-op.
revoke all on function public.redeem_invite_code(text) from public, anon;
grant execute on function public.redeem_invite_code(text) to authenticated;

revoke all on function public.consume_action_quota(text, integer, integer, uuid, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.consume_action_quota(text, integer, integer, uuid, uuid, uuid, text, integer, integer) to authenticated, service_role;
