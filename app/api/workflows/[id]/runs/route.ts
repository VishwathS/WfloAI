import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
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
    return apiError("api.workflows.runs.workflow_lookup_failed", workflowError);
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
    return apiError("api.workflows.runs.runs_query_failed", runsError);
  }

  return NextResponse.json({ runs: runs ?? [] }, { status: 200 });
}
