import { redirect } from "next/navigation";
import { CreateWorkflowButton } from "@/components/dashboard/create-workflow-button";
import { TemplateGallery } from "@/components/dashboard/template-gallery";
import { WorkflowList } from "@/components/dashboard/workflow-list";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ExecutionLogRow, Workflow, WorkflowWithLastRun } from "@/lib/types";

export const dynamic = "force-dynamic";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
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
  let lastRunMap = new Map<string, string>();
  let nextRunMap = new Map<string, string>();

  if (workflowIds.length > 0) {
    const { data: executionLogRows, error: executionLogError } = await supabase
      .from("execution_logs")
      .select("workflow_id, ran_at")
      .in("workflow_id", workflowIds)
      .order("ran_at", { ascending: false });

    if (executionLogError) {
      const isMissingExecutionLogsTable =
        executionLogError.message.includes("public.execution_logs") ||
        executionLogError.message.includes("execution_logs");

      if (!isMissingExecutionLogsTable) {
        throw new Error(executionLogError.message);
      }
    } else {
      lastRunMap = (executionLogRows ?? []).reduce<Map<string, string>>((accumulator, row) => {
        const logRow = row as Pick<ExecutionLogRow, "workflow_id" | "ran_at">;

        if (!accumulator.has(logRow.workflow_id)) {
          accumulator.set(logRow.workflow_id, logRow.ran_at);
        }

        return accumulator;
      }, new Map<string, string>());
    }
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
    last_run_at: lastRunMap.get(workflow.id) ?? null,
    next_run_at: nextRunMap.get(workflow.id) ?? null
  }));
  const workflowCount = workflowsWithLastRun.length;
  const latestWorkflow = workflowsWithLastRun[0];

  const hours = new Date().getHours();
  const timeOfDay = hours < 12 ? "morning" : hours < 17 ? "afternoon" : "evening";
  const rawName = (user.email ?? "").split("@")[0].split(".")[0];
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <section className="rounded-2xl border border-gray-200 bg-white px-8 py-8 shadow-card">
        <p className="text-xl font-semibold tracking-tight text-gray-900">
          Good {timeOfDay}, {displayName}
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Build AI-native automations visually.
        </p>
        <p className="mt-0.5 text-sm text-gray-400">
          From blank canvas to intelligent workflows.
        </p>
        <div className="mt-6">
          <CreateWorkflowButton />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
            Library
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-gray-900">
            {workflowCount} {workflowCount === 1 ? "workflow" : "workflows"}
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Everything you are building lives here, ready to be edited or expanded.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
            Recent activity
          </p>
          <p className="mt-3 text-base font-semibold text-gray-900">
            {latestWorkflow ? formatTimestamp(latestWorkflow.updated_at) : "No activity yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-500">
            {latestWorkflow
              ? `Most recently touched: ${latestWorkflow.name}.`
              : "Create your first workflow to begin tracking updates here."}
          </p>
        </div>
      </section>

      <WorkflowList workflows={workflowsWithLastRun} />

      <TemplateGallery />
    </div>
  );
}
