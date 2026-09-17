import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkflowGraph } from "@/lib/types";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isValidGraph(value: unknown): value is WorkflowGraph {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeGraph = value as WorkflowGraph;

  return Array.isArray(maybeGraph.nodes) && Array.isArray(maybeGraph.edges);
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

  let body: { graph?: unknown };

  try {
    body = (await request.json()) as { graph?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidGraph(body.graph)) {
    return NextResponse.json({ error: "Invalid graph payload" }, { status: 400 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (workflowError) {
    return apiError("api.workflows.item.workflow_lookup_failed", workflowError);
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  if (workflow.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("workflows")
    .update({
      graph: body.graph
    })
    .eq("id", params.id);

  if (updateError) {
    return apiError("api.workflows.item.update_failed", updateError);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
