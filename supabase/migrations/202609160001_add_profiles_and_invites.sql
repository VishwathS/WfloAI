-- A3 — admission control. Every cost and abuse control in the release plan is
-- downstream of who gets an account, and today anyone with a Google account who
-- reaches the login page gets one, with access to the shared Anthropic and
-- Tavily keys.
--
-- Mechanism: ONE gate (profiles.approved) with ONE self-serve way to pass it
-- (redeeming an invite code). MASTER section 4 Phase 2 is explicit that
-- "strangers get in here, but only behind an invite gate", which is what picks
-- invite code over operator-approval-only. The operator can still approve
-- directly with a SQL update, which task 08 says is acceptable for V1.

-- Profile rows exist for every user; approved starts false.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved boolean not null default false,
  approved_at timestamptz,
  invite_code_used text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Read your own row, and nothing else. There is deliberately NO update policy:
-- `approved` is the gate, so a user who could update their own row could open
-- it. It is written only by redeem_invite_code (security definer) or by the
-- operator through the service role.
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
using (auth.uid() = user_id);

-- Invite codes are operator data. RLS is enabled with no policies at all, so
-- anon and authenticated clients can neither read nor write them; only the
-- service role and security-definer functions reach them. A readable code table
-- would defeat the gate.
create table if not exists public.invite_codes (
  code text primary key,
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  disabled boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

-- Backfill: every existing auth user gets a profile. approved is left FALSE
-- here on purpose. Task 08's Stop Conditions call retroactively de-authorising
-- real accounts an operator decision, and task 08 Manual Step 4 says to seed the
-- approval list before deploying the gate — so seeding is a deliberate operator
-- step, not something this migration guesses at. See the comment at the bottom.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- New users get a profile at sign-up. Without this, a first-time Google login
-- would have no row and the gate would have nothing to read.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Redemption. security definer because invite_codes is unreadable to the
-- caller by design, and because approving a profile is exactly the write the
-- caller must not be able to perform directly.
--
-- The row lock is what makes max_uses real: two people redeeming the last use
-- of the same code concurrently would otherwise both observe uses < max_uses.
-- `for update` serialises them on the code row, and the second sees the
-- incremented count.
--
-- Returns the outcome as text rather than raising, so the caller can map it to
-- a message without parsing an error string.
create or replace function public.redeem_invite_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code    public.invite_codes%rowtype;
begin
  if v_user_id is null then
    return 'unauthenticated';
  end if;

  -- Already in? Redeeming again must not burn a use.
  if exists (select 1 from public.profiles where user_id = v_user_id and approved) then
    return 'already_approved';
  end if;

  select * into v_code
  from public.invite_codes
  where code = trim(p_code)
  for update;

  if not found then
    return 'invalid';
  end if;

  if v_code.disabled then
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

  return 'approved';
end;
$$;

revoke all on function public.redeem_invite_code(text) from public;
grant execute on function public.redeem_invite_code(text) to authenticated;

-- Operator steps, deliberately NOT performed by this migration.
--
-- 1. Seed yourself and your Phase 1 testers BEFORE the gate reaches an
--    environment with real accounts, or you lock yourself out:
--
--      update public.profiles set approved = true, approved_at = now()
--      where user_id in (select id from auth.users where email in ('...'));
--
-- 2. Create invite codes as needed:
--
--      insert into public.invite_codes (code, max_uses, expires_at, note)
--      values ('beta-7f3a91', 25, now() + interval '30 days', 'phase 2 beta');
--
-- 3. Revoking access is `update public.profiles set approved = false`. It takes
--    effect on the next request; no session invalidation is involved.
--
-- 4. The backfill above deliberately leaves existing accounts UNAPPROVED. That
--    is the shape task 08 Manual Step 4 assumes ("seed the approval list ...
--    or you will lock yourself out"), and it keeps the decision with you. If
--    you would rather grandfather everyone who already signed up, change the
--    backfill to:
--
--      insert into public.profiles (user_id, approved, approved_at)
--      select id, true, now() from auth.users
--      on conflict (user_id) do nothing;
--
--    Which of these is right depends on who already has an account, which is a
--    fact about your database and not about this repository.
