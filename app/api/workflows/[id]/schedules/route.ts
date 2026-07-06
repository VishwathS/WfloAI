import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeNextRunAt, isValidCronExpression, isValidTimezone } from "@/lib/schedule/cron";

interface RouteContext {
  params: {
    id: string;
  };
}

interface SchedulePayload {
  name: string;
  enabled: boolean;
  cron_expression: string;
  timezone: string;
  input_values?: Record<string, string>;
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

export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
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
    return NextResponse.json({ error: workflowError.message }, { status: 500 });
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
    return NextResponse.json({ error: schedulesError.message }, { status: 500 });
  }

  return NextResponse.json({ schedules: schedules ?? [] }, { status: 200 });
}

export async function POST(request: Request, { params }: RouteContext) {
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

  if (!isValidSchedulePayload(body)) {
    return NextResponse.json({ error: "Invalid schedule payload" }, { status: 400 });
  }

  if (!isValidTimezone(body.timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  if (!isValidCronExpression(body.cron_expression, body.timezone)) {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (workflowError) {
    return NextResponse.json({ error: workflowError.message }, { status: 500 });
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      next_run_at: body.enabled ? computeNextRunAt(body.cron_expression, body.timezone) : null
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ schedule }, { status: 201 });
}
