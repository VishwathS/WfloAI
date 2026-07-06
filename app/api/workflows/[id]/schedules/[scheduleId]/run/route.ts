import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inngest, workflowScheduleDue } from "@/lib/inngest/client";

interface RouteContext {
  params: {
    id: string;
    scheduleId: string;
  };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: schedule, error } = await supabase
    .from("workflow_schedules")
    .select("id, workflow_id, user_id")
    .eq("id", params.scheduleId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!schedule || schedule.workflow_id !== params.id) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  if (schedule.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await inngest.send(
    workflowScheduleDue.create({
      scheduleId: schedule.id,
      workflowId: params.id,
      userId: user.id
    })
  );

  return NextResponse.json({ success: true }, { status: 202 });
}
