import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteContext {
  params: {
    id: string;
  };
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
