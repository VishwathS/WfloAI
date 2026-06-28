import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteContext {
  params: {
    id: string;
  };
}

function isValidRunPayload(value: unknown): value is {
  status: "success" | "error";
  final_output: string | null;
  node_outputs: unknown;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const v = value as Record<string, unknown>;

  return v.status === "success" || v.status === "error";
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

  const { data: runs, error: runsError } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", params.id)
    .order("created_at", { ascending: false });

  if (runsError) {
    return NextResponse.json({ error: runsError.message }, { status: 500 });
  }

  return NextResponse.json({ runs: runs ?? [] }, { status: 200 });
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

  if (!isValidRunPayload(body)) {
    return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
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

  const { error: insertError } = await supabase.from("workflow_runs").insert({
    workflow_id: params.id,
    user_id: user.id,
    status: body.status,
    final_output: body.final_output,
    node_outputs: body.node_outputs,
    error: body.error,
    started_at: body.started_at,
    completed_at: body.completed_at
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
