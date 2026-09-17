import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/observability/apiError";

// A8, second half. User-scoped client throughout: RLS is the ownership guard,
// and there is no reason for the admin client to appear anywhere in an export.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflows, error: workflowError } = await supabase
    .from("workflows")
    .select("id, name, description, graph, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (workflowError) {
    return apiError("api.account.export.workflows_failed", workflowError, { userId: user.id });
  }

  const { data: runs, error: runError } = await supabase
    .from("workflow_runs")
    .select("id, workflow_id, status, final_output, node_outputs, error, trigger, started_at, completed_at, created_at")
    .order("created_at", { ascending: true });

  if (runError) {
    return apiError("api.account.export.runs_failed", runError, { userId: user.id });
  }

  const { data: schedules, error: scheduleError } = await supabase
    .from("workflow_schedules")
    .select("id, workflow_id, name, enabled, cron_expression, timezone, input_values, created_at")
    .order("created_at", { ascending: true });

  if (scheduleError) {
    return apiError("api.account.export.schedules_failed", scheduleError, { userId: user.id });
  }

  // Deliberately absent: gmail_connections and user_credentials. Both hold
  // encrypted secrets, and the application never returns a stored secret to a
  // browser. Exporting them would be the one place that rule broke.
  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null },
    workflows: workflows ?? [],
    runs: runs ?? [],
    schedules: schedules ?? [],
    notIncluded: [
      "Gmail tokens and stored API credentials, which are encrypted secrets and are never returned to a browser.",
      "Uploaded file bytes. The extracted text is part of each workflow run that used it."
    ]
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="wfloai-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
