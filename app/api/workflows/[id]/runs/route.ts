import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// B2 / C4. The endpoint returned every row a workflow had ever produced, and
// each row carries every node full output text — a heavy user history makes it
// unusable on its own, independently of retention.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function readPaging(request: Request): { limit: number; offset: number } {
  const params = new URL(request.url).searchParams;
  const rawLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const rawOffset = Number.parseInt(params.get("offset") ?? "", 10);

  return {
    limit: Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0
  };
}

export async function GET(request: Request, context: RouteContext) {
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

  const { limit, offset } = readPaging(request);

  const {
    data: runs,
    error: runsError,
    count
  } = await supabase
    .from("workflow_runs")
    .select("*", { count: "exact" })
    .eq("workflow_id", params.id)
    // id breaks ties: two runs can share a created_at to the microsecond, and
    // without a tiebreaker the same row can appear on two pages or on none.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (runsError) {
    return apiError("api.workflows.runs.runs_query_failed", runsError);
  }

  const rows = runs ?? [];
  const total = count ?? rows.length;
  const nextOffset = offset + rows.length;

  return NextResponse.json(
    { runs: rows, total, limit, offset, hasMore: nextOffset < total, nextOffset },
    { status: 200 }
  );
}
