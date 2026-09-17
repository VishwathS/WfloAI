import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/integrations/audit";
import {
  UNATTENDED_SEND_CONSENT_CODE,
  UNATTENDED_SEND_CONSENT_MESSAGE,
  requiresUnattendedSendConsent
} from "@/lib/schedule/consent";
import type { WorkflowGraph } from "@/lib/types";
import { computeNextRunAt, isValidCronExpression, isValidTimezone } from "@/lib/schedule/cron";
import { meetsIntervalFloor } from "@/lib/schedule/cron";
import { SCHEDULE_LIMITS } from "@/lib/schedule/constants";
import type { WorkflowSchedule } from "@/lib/types";

interface RouteContext {
  params: Promise<{
    id: string;
    scheduleId: string;
  }>;
}

interface ScheduleUpdatePayload {
  name?: string;
  enabled?: boolean;
  cron_expression?: string;
  timezone?: string;
  input_values?: Record<string, string>;
  // A14a: explicit authorisation for unattended sending. Absent or false is a
  // refusal, never an omission that defaults to consent.
  unattended_send_ack?: boolean;
}

function isValidScheduleUpdatePayload(value: unknown): value is ScheduleUpdatePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;

  if (v.name !== undefined && (typeof v.name !== "string" || v.name.trim().length === 0)) {
    return false;
  }

  if (v.enabled !== undefined && typeof v.enabled !== "boolean") {
    return false;
  }

  if (v.cron_expression !== undefined && typeof v.cron_expression !== "string") {
    return false;
  }

  if (v.timezone !== undefined && typeof v.timezone !== "string") {
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

async function loadOwnedSchedule(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  params: Awaited<RouteContext["params"]>,
  userId: string
) {
  const { data: schedule, error } = await supabase
    .from("workflow_schedules")
    .select("*")
    .eq("id", params.scheduleId)
    .maybeSingle();

  if (error) {
    return { response: apiError("api.workflows.schedules.item.query_failed", error) };
  }

  if (!schedule || schedule.workflow_id !== params.id) {
    return { response: NextResponse.json({ error: "Schedule not found" }, { status: 404 }) };
  }

  if (schedule.user_id !== userId) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { schedule: schedule as WorkflowSchedule };
}

export async function PATCH(request: Request, context: RouteContext) {
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

  if (!isValidScheduleUpdatePayload(body)) {
    return NextResponse.json({ error: "Invalid schedule payload" }, { status: 400 });
  }

  const result = await loadOwnedSchedule(supabase, params, user.id);

  if (result.response) {
    return result.response;
  }

  const enabled = body.enabled ?? result.schedule.enabled;
  const cronExpression = body.cron_expression ?? result.schedule.cron_expression;
  const timezone = body.timezone ?? result.schedule.timezone;

  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  if (!meetsIntervalFloor(cronExpression, timezone)) {
    return NextResponse.json(
      {
        error: `Schedules must run at most once every ${SCHEDULE_LIMITS.MIN_INTERVAL_MINUTES} minutes.`
      },
      { status: 400 }
    );
  }

  if (!isValidCronExpression(cronExpression, timezone)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  // A14a. Turning a schedule ON is the authorisation moment for unattended
  // sending; leaving it on while renaming it is not, so the gate fires only on
  // the transition into enabled.
  const isEnabling = body.enabled === true && !result.schedule.enabled;
  let authorizedAt: string | null = null;

  if (isEnabling) {
    const { data: workflow, error: workflowError } = await supabase
      .from("workflows")
      .select("graph")
      .eq("id", params.id)
      .maybeSingle();

    if (workflowError) {
      return apiError("api.workflows.schedules.item.workflow_lookup_failed", workflowError);
    }

    const graph = (workflow?.graph ?? { nodes: [], edges: [] }) as WorkflowGraph;

    // A14a: a schedule that already carries authorisation does not re-ask. That
    // authorisation is cleared whenever a graph edit newly makes the workflow
    // send (disableUnauthorizedSendSchedules), so this cannot silently inherit
    // consent across a change that introduced sending.
    if (requiresUnattendedSendConsent(true, graph.nodes, result.schedule)) {
      if (body.unattended_send_ack !== true) {
        return NextResponse.json(
          { error: UNATTENDED_SEND_CONSENT_MESSAGE, code: UNATTENDED_SEND_CONSENT_CODE },
          { status: 400 }
        );
      }

      authorizedAt = new Date().toISOString();

      // The audit event stays as historical evidence of who confirmed and when.
      // It is no longer what the application consults, so retention deleting it
      // cannot change whether this schedule may send.
      await recordAuditEvent(
        supabase,
        user.id,
        "gmail.unattended_send.authorized",
        "succeeded",
        params.scheduleId
      );
    }
  }

  const { data: schedule, error: updateError } = await supabase
    .from("workflow_schedules")
    .update({
      name: body.name?.trim() ?? result.schedule.name,
      enabled,
      // Re-enabling clears the auto-disable reason and the failure run: the
      // user is deliberately restarting the automation.
      ...(enabled ? { consecutive_failures: 0, disabled_reason: null } : {}),
      // Only ever written on an explicit confirmation. Absent one, whatever the
      // schedule already carried is left untouched.
      ...(authorizedAt ? { unattended_send_authorized_at: authorizedAt } : {}),
      cron_expression: cronExpression,
      timezone,
      input_values: body.input_values ?? result.schedule.input_values,
      next_run_at: enabled ? computeNextRunAt(cronExpression, timezone) : null
    })
    .eq("id", params.scheduleId)
    .select()
    .single();

  if (updateError) {
    return apiError("api.workflows.schedules.item.update_failed", updateError);
  }

  return NextResponse.json({ schedule }, { status: 200 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const params = await context.params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await loadOwnedSchedule(supabase, params, user.id);

  if (result.response) {
    return result.response;
  }

  const { error: deleteError } = await supabase
    .from("workflow_schedules")
    .delete()
    .eq("id", params.scheduleId);

  if (deleteError) {
    return apiError("api.workflows.schedules.item.delete_failed", deleteError);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
