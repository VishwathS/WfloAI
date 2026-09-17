import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { SCHEDULE_LIMITS } from "@/lib/schedule/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/integrations/audit";
import {
  UNATTENDED_SEND_CONSENT_CODE,
  UNATTENDED_SEND_CONSENT_MESSAGE,
  requiresUnattendedSendConsent
} from "@/lib/schedule/consent";
import { containsSendCapableGmailNode } from "@/lib/execution/validate";
import type { WorkflowGraph } from "@/lib/types";
import { computeNextRunAt, isValidCronExpression, isValidTimezone, meetsIntervalFloor } from "@/lib/schedule/cron";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface SchedulePayload {
  name: string;
  enabled: boolean;
  cron_expression: string;
  timezone: string;
  input_values?: Record<string, string>;
  // A14a: the explicit authorisation for unattended sending. Absent or false
  // is a refusal, never an omission that defaults to consent.
  unattended_send_ack?: boolean;
}

function isValidSchedulePayload(value: unknown): value is SchedulePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;

  if (typeof v.name !== "string" || v.name.trim().length === 0) {
    return false;
  }

  if (typeof v.enabled !== "boolean") {
    return false;
  }

  if (typeof v.cron_expression !== "string" || typeof v.timezone !== "string") {
    return false;
  }

  if (v.input_values !== undefined) {
    if (!v.input_values || typeof v.input_values !== "object" || Array.isArray(v.input_values)) {
      return false;
    }

    if (Object.values(v.input_values).some((entry) => typeof entry !== "string")) {
      return false;
    }
  }

  return true;
}

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (workflowError) {
    return apiError("api.workflows.schedules.workflow_lookup_failed", workflowError);
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: schedules, error: schedulesError } = await supabase
    .from("workflow_schedules")
    .select("*")
    .eq("workflow_id", params.id)
    .order("created_at", { ascending: true });

  if (schedulesError) {
    return apiError("api.workflows.schedules.schedules_query_failed", schedulesError);
  }

  return NextResponse.json({ schedules: schedules ?? [] }, { status: 200 });
}

export async function POST(request: Request, context: RouteContext) {
  const params = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidSchedulePayload(body)) {
    return NextResponse.json({ error: "Invalid schedule payload" }, { status: 400 });
  }

  if (!isValidTimezone(body.timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  if (!isValidCronExpression(body.cron_expression, body.timezone)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  // A12: validated against the parsed cron, so every spelling of "every
  // minute" is rejected, not just the literal one.
  if (!meetsIntervalFloor(body.cron_expression, body.timezone)) {
    return NextResponse.json({ error: `Schedules must run at most once every ${SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES} minutes.` }, { status: 400 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id, user_id, graph")
    .eq("id", params.id)
    .maybeSingle();

  if (workflowError) {
    return apiError("api.workflows.schedules.workflow_lookup_failed", workflowError);
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A14a: creating an already-enabled schedule on a send-capable graph is the
  // same authorisation moment as enabling one later, so it is gated the same
  // way. A graph that cannot send, or a schedule created disabled, is not.
  const graph = (workflow.graph ?? { nodes: [], edges: [] }) as WorkflowGraph;

  if (
    requiresUnattendedSendConsent(body.enabled, graph.nodes) &&
    body.unattended_send_ack !== true
  ) {
    return NextResponse.json(
      { error: UNATTENDED_SEND_CONSENT_MESSAGE, code: UNATTENDED_SEND_CONSENT_CODE },
      { status: 400 }
    );
  }

  // A12: a per-user cap. The poller's global .limit(50) is a throughput
  // ceiling on the poller, not a per-user quota.
  const { count: userScheduleCount, error: userCountError } = await supabase
    .from("workflow_schedules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (userCountError) {
    return apiError("api.workflows.schedules.count_failed", userCountError);
  }

  if ((userScheduleCount ?? 0) >= SCHEDULE_LIMITS.MAX_SCHEDULES_PER_USER) {
    return NextResponse.json(
      {
        error: `You've reached the limit of ${SCHEDULE_LIMITS.MAX_SCHEDULES_PER_USER} schedules. Delete one before adding another.`
      },
      { status: 400 }
    );
  }

  const { count: workflowScheduleCount, error: workflowCountError } = await supabase
    .from("workflow_schedules")
    .select("id", { count: "exact", head: true })
    .eq("workflow_id", params.id);

  if (workflowCountError) {
    return apiError("api.workflows.schedules.count_failed", workflowCountError);
  }

  if ((workflowScheduleCount ?? 0) >= SCHEDULE_LIMITS.MAX_SCHEDULES_PER_WORKFLOW) {
    return NextResponse.json(
      {
        error: `This workflow already has the maximum of ${SCHEDULE_LIMITS.MAX_SCHEDULES_PER_WORKFLOW} schedules.`
      },
      { status: 400 }
    );
  }

  const { data: schedule, error: insertError } = await supabase
    .from("workflow_schedules")
    .insert({
      workflow_id: params.id,
      user_id: user.id,
      name: body.name.trim(),
      enabled: body.enabled,
      cron_expression: body.cron_expression,
      timezone: body.timezone,
      input_values: body.input_values ?? {},
      next_run_at: body.enabled ? computeNextRunAt(body.cron_expression, body.timezone) : null,
      // A14a: the operative authorisation, durable on the schedule. Set only
      // when the user actually confirmed an enable on a send-capable graph —
      // never inferred, and never set for a schedule that cannot send.
      unattended_send_authorized_at:
        body.enabled &&
        body.unattended_send_ack === true &&
        containsSendCapableGmailNode(graph.nodes)
          ? new Date().toISOString()
          : null
    })
    .select()
    .single();

  if (insertError) {
    return apiError("api.workflows.schedules.insert_failed", insertError);
  }

  if (requiresUnattendedSendConsent(body.enabled, graph.nodes)) {
    await recordAuditEvent(
      supabase,
      user.id,
      "gmail.unattended_send.authorized",
      "succeeded",
      (schedule as { id: string }).id
    );
  }

  return NextResponse.json({ schedule }, { status: 201 });
}
