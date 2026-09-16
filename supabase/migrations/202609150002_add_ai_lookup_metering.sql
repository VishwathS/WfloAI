-- A2 / B11 — bring AI and Lookup spend under the same durable, DB-backed
-- mechanism that already governs Gmail and HTTP, and make the quota check
-- atomic rather than check-then-act.
--
-- One mechanism, not a parallel system: integration_action_executions gains
-- the action types 'ai.call' and 'lookup.search'. action_type is free text with
-- no CHECK constraint, so no type change is needed.

-- Billable shape (D3 is deferred; this is the foundation, not billing).
-- Integer columns rather than jsonb so the unit-cost query is a plain SUM:
--   AI     — input_units/output_units are Anthropic input/output tokens
--   Lookup — output_units is the number of results returned; input_units null
alter table public.integration_action_executions
  add column if not exists input_units integer,
  add column if not exists output_units integer;

comment on column public.integration_action_executions.input_units is
  'Billable input measure. AI: input tokens. Null where the provider gives none.';
comment on column public.integration_action_executions.output_units is
  'Billable output measure. AI: output tokens. Lookup: results returned.';

-- /api/execute and /api/lookup are authenticated single-step endpoints with no
-- workflow or run context, but they spend the operator's money and so must be
-- metered by the same table. Their rows carry no workflow_id/run_id.
alter table public.integration_action_executions
  alter column workflow_id drop not null,
  alter column run_id drop not null;

-- The ownership guard is unchanged in substance: a row may still only name a
-- workflow the caller owns. A null workflow_id cannot reference anyone else's
-- data, and user_id is still pinned to the caller.
drop policy if exists "Users can insert their own integration actions" on public.integration_action_executions;
create policy "Users can insert their own integration actions"
on public.integration_action_executions
for insert
with check (
  auth.uid() = user_id
  and (
    workflow_id is null
    or exists (
      select 1 from public.workflows
      where id = workflow_id
      and user_id = auth.uid()
    )
  )
);

-- Atomic check-and-consume (B11).
--
-- The existing windows are read-then-write: two concurrent requests can both
-- observe count = limit - 1 and both proceed. Counting and inserting inside one
-- statement does not fix that on its own under READ COMMITTED, because the two
-- transactions cannot see each other's uncommitted insert. A transaction-scoped
-- advisory lock keyed on (user, action type) serializes exactly the callers that
-- could race, and is released on commit or rollback.
--
-- security invoker: RLS still applies, so the count sees only the caller's own
-- rows and the insert is still checked by the policy above.
create or replace function public.consume_action_quota(
  p_action_type text,
  p_per_minute integer,
  p_per_day integer,
  p_user_id uuid default null,
  p_workflow_id uuid default null,
  p_run_id uuid default null,
  p_node_id text default null,
  p_input_units integer default null,
  p_output_units integer default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  -- Scheduled runs come through the service-role client, where auth.uid() is
  -- null and RLS is bypassed; there the caller must name the owner explicitly,
  -- which is the same ownership pattern resolveFileInputs uses on that path.
  -- A request-scoped caller may not name a different user than its own session.
  v_user_id uuid := coalesce(auth.uid(), p_user_id);
  v_used integer;
  v_execution_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  end if;

  if auth.uid() is not null and p_user_id is not null and auth.uid() <> p_user_id then
    return jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_action_type));

  if p_per_minute is not null then
    select count(*) into v_used
      from public.integration_action_executions
     where user_id = v_user_id
       and action_type = p_action_type
       and created_at >= now() - interval '1 minute';

    if v_used >= p_per_minute then
      return jsonb_build_object('allowed', false, 'reason', 'per_minute', 'limit', p_per_minute);
    end if;
  end if;

  if p_per_day is not null then
    select count(*) into v_used
      from public.integration_action_executions
     where user_id = v_user_id
       and action_type = p_action_type
       and created_at >= now() - interval '1 day';

    if v_used >= p_per_day then
      return jsonb_build_object('allowed', false, 'reason', 'per_day', 'limit', p_per_day);
    end if;
  end if;

  -- Inserted as 'pending': the quota is consumed before the provider is called,
  -- so an in-flight call already counts against the window. The caller settles
  -- the row to 'succeeded' (with measured usage) or 'failed' afterwards, which
  -- the status-constrained UPDATE policy from 202609150001 permits precisely
  -- because the row is still 'pending'.
  insert into public.integration_action_executions (
    user_id, workflow_id, run_id, node_id, action_type,
    idempotency_key, status, input_units, output_units
  ) values (
    v_user_id, p_workflow_id, p_run_id, coalesce(p_node_id, 'single-step'), p_action_type,
    -- Metering rows are not idempotency claims: every call is a distinct spend
    -- event and must be counted, never deduplicated or replayed.
    p_action_type || ':' || gen_random_uuid()::text,
    'pending', p_input_units, p_output_units
  )
  returning id into v_execution_id;

  return jsonb_build_object('allowed', true, 'execution_id', v_execution_id);
end;
$$;

revoke all on function public.consume_action_quota(text, integer, integer, uuid, uuid, uuid, text, integer, integer) from public;
grant execute on function public.consume_action_quota(text, integer, integer, uuid, uuid, uuid, text, integer, integer) to authenticated, service_role;
