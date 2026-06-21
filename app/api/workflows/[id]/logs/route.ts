import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ExecutionLogEntry } from "@/lib/execution/types";

interface RouteContext {
  params: {
    id: string;
  };
}

function isValidNodeResults(value: unknown): value is ExecutionLogEntry[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const result = entry as ExecutionLogEntry;

    return (
      typeof result.nodeId === "string" &&
      typeof result.status === "string" &&
      typeof result.output === "string" &&
      (typeof result.durationMs === "number" || typeof result.durationMs === "undefined")
    );
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { node_results?: unknown };

  try {
    body = (await request.json()) as { node_results?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidNodeResults(body.node_results)) {
    return NextResponse.json({ error: "Invalid node_results payload" }, { status: 400 });
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

  const { error: insertError } = await supabase.from("execution_logs").insert({
    workflow_id: params.id,
    user_id: user.id,
    node_results: body.node_results
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
