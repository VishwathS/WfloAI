import { redirect } from "next/navigation";
import { CreateWorkflowButton } from "@/components/dashboard/create-workflow-button";
import { TemplateGallery } from "@/components/dashboard/template-gallery";
import { WorkflowList } from "@/components/dashboard/workflow-list";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Workflow, WorkflowWithLastRun } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const workflows = (data ?? []) as Workflow[];
  const workflowIds = workflows.map((workflow) => workflow.id);
  type LastRun = { created_at: string; status: "success" | "error" };
  let lastRunMap = new Map<string, LastRun>();
  let nextRunMap = new Map<string, string>();

  if (workflowIds.length > 0) {
    const { data: runRows, error: runError } = await supabase
      .from("workflow_runs")
      .select("workflow_id, created_at, status")
      .in("workflow_id", workflowIds)
      .order("created_at", { ascending: false });

    if (runError) {
      throw new Error(runError.message);
    }

    lastRunMap = (runRows ?? []).reduce<Map<string, LastRun>>((accumulator, row) => {
      const runRow = row as { workflow_id: string } & LastRun;

      if (!accumulator.has(runRow.workflow_id)) {
        accumulator.set(runRow.workflow_id, {
          created_at: runRow.created_at,
          status: runRow.status
        });
      }

      return accumulator;
    }, new Map<string, LastRun>());
  }

  if (workflowIds.length > 0) {
    const { data: scheduleRows } = await supabase
      .from("workflow_schedules")
      .select("workflow_id, next_run_at")
      .in("workflow_id", workflowIds)
      .eq("enabled", true)
      .not("next_run_at", "is", null)
      .order("next_run_at", { ascending: true });

    nextRunMap = (scheduleRows ?? []).reduce<Map<string, string>>((accumulator, row) => {
      const scheduleRow = row as { workflow_id: string; next_run_at: string };

      if (!accumulator.has(scheduleRow.workflow_id)) {
        accumulator.set(scheduleRow.workflow_id, scheduleRow.next_run_at);
      }

      return accumulator;
    }, new Map<string, string>());
  }

  const workflowsWithLastRun = workflows.map<WorkflowWithLastRun>((workflow) => ({
    ...workflow,
    last_run_at: lastRunMap.get(workflow.id)?.created_at ?? null,
    last_run_status: lastRunMap.get(workflow.id)?.status ?? null,
    next_run_at: nextRunMap.get(workflow.id) ?? null
  }));
  const workflowCount = workflowsWithLastRun.length;
  const latestWorkflow = workflowsWithLastRun[0];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-6 py-5 shadow-card">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Dashboard</h1>
        <CreateWorkflowButton />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
            Library
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-gray-900">
            {workflowCount} {workflowCount === 1 ? "workflow" : "workflows"}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
            Last edited
          </p>
          <p className="mt-3 text-base font-semibold text-gray-900">
            {latestWorkflow ? formatTimestamp(latestWorkflow.updated_at) : "Never"}
          </p>
          {latestWorkflow ? (
            <p className="mt-1 truncate text-sm leading-6 text-gray-500">{latestWorkflow.name}</p>
          ) : null}
        </div>
      </section>

      <WorkflowList workflows={workflowsWithLastRun} />

      <TemplateGallery />
    </div>
  );
}
