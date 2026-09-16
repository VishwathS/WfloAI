-- A13 — close the two self-service escalation paths on the idempotency ledger.
--
-- DELETE was a quota-reset primitive: the Gmail and HTTP windows in
-- lib/integrations/limits.ts are derived by COUNTing rows in this table, so a
-- user who deletes their own rows resets their own quota. No application code
-- ever deletes from this table, so the policy is dropped outright.
--
-- UPDATE was a re-send primitive: claimAction() reclaims rows in 'failed' state
-- via a conditional UPDATE, so a user who flipped 'succeeded' -> 'failed' could
-- make an already-delivered action execute a second time. That defeats the
-- duplicate-send invariant CLAUDE.md lists as non-negotiable.
--
-- UPDATE is NOT dropped, because the audit's premise that both write paths
-- bypass RLS is only half true:
--
--   * scheduled runs (lib/inngest/functions.ts) use the service-role admin
--     client and do bypass RLS;
--   * MANUAL runs pass the *user-scoped* client into IntegrationContext
--     (app/api/workflows/[id]/execute/route.ts), so claimAction,
--     markActionSucceeded, markActionFailed and markActionUnknown all write
--     this table under RLS as the authenticated user.
--
-- Dropping UPDATE would therefore break every manual Gmail/HTTP run at the
-- point where it records a *successful* external action — the email would be
-- sent and the ledger write would fail. That is strictly worse than the
-- vulnerability being closed.
--
-- Instead the policy is constrained by the row's CURRENT status. RLS evaluates
-- USING against the existing row, so this permits exactly the transitions the
-- application makes and nothing else:
--
--   pending -> succeeded | failed | unknown   (markAction*)   allowed
--   failed  -> pending                        (claim reclaim) allowed
--   succeeded -> anything                                     denied
--   unknown   -> anything                                     denied
--
-- 'succeeded' and 'unknown' become terminal from the user's side, which is what
-- removes the re-send primitive. 'unknown' is included because CLAUDE.md
-- requires ambiguous outcomes never to be auto-retried.
--
-- Residual, accepted: a user may still write arbitrary result_output on their
-- own 'pending' row. That only replays fabricated output to themselves and
-- causes no external side effect; WITH CHECK keeps user_id pinned to them.

drop policy if exists "Users can delete their own integration actions" on public.integration_action_executions;

drop policy if exists "Users can update their own integration actions" on public.integration_action_executions;
create policy "Users can update their own unsettled integration actions"
on public.integration_action_executions
for update
using (
  auth.uid() = user_id
  and status in ('pending', 'failed')
)
with check (auth.uid() = user_id);
