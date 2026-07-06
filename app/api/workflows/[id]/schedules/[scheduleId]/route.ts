import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeNextRunAt, isValidCronExpression, isValidTimezone } from "@/lib/schedule/cron";
import type { WorkflowSchedule } from "@/lib/types";

interface RouteContext {
  params: {
    id: string;
    scheduleId: string;
  };
}

interface ScheduleUpdatePayload {
  name?: string;
  enabled?: boolean;
  cron_expression?: string;
  timezone?: string;
  input_values?: Record<string, string>;
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
  supabase: ReturnType<typeof createServerSupabaseClient>,
  params: RouteContext["params"],
  userId: string
) {
  const { data: schedule, error } = await supabase
    .from("workflow_schedules")
    .select("*")
    .eq("id", params.scheduleId)
    .maybeSingle();

  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!schedule || schedule.workflow_id !== params.id) {
    return { response: NextResponse.json({ error: "Schedule not found" }, { status: 404 }) };
  }

  if (schedule.user_id !== userId) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { schedule: schedule as WorkflowSchedule };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
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

  if (!isValidCronExpression(cronExpression, timezone)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  const { data: schedule, error: updateError } = await supabase
    .from("workflow_schedules")
    .update({
      name: body.name?.trim() ?? result.schedule.name,
      enabled,
      cron_expression: cronExpression,
      timezone,
      input_values: body.input_values ?? result.schedule.input_values,
      next_run_at: enabled ? computeNextRunAt(cronExpression, timezone) : null
    })
    .eq("id", params.scheduleId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ schedule }, { status: 200 });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
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
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
