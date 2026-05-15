import { redirect } from "next/navigation";
import { CreateWorkflowButton } from "@/components/dashboard/create-workflow-button";
import { WorkflowList } from "@/components/dashboard/workflow-list";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Workflow } from "@/lib/types";

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
  const workflowCount = workflows.length;
  const latestWorkflow = workflows[0];

  return (
    <div className="space-y-8 p-6 lg:p-10">
      <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(8,145,178,0.94),rgba(15,23,42,0.98))] px-6 py-7 text-white shadow-[0_28px_80px_-35px_rgba(8,145,178,0.8)] lg:px-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.22),transparent_58%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-100/80">
              Workflow command center
            </p>
            <div className="space-y-3">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white lg:text-5xl">
                Build AI-native automations with a sharper starting point.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Keep your workflows organized, iterate quickly, and move from blank
                canvases to intelligent orchestration without the usual dashboard clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <CreateWorkflowButton />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.18)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
            Library
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {workflowCount} {workflowCount === 1 ? "workflow" : "workflows"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Everything you are building lives here, ready to be edited, expanded, or
            archived when it no longer earns its space.
          </p>
        </div>
        <div className="rounded-[28px] border border-cyan-200/70 bg-cyan-50/80 p-6 shadow-[0_24px_60px_-32px_rgba(6,182,212,0.24)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
            Recent activity
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            {latestWorkflow ? formatTimestamp(latestWorkflow.updated_at) : "No activity yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {latestWorkflow
              ? `Most recently touched: ${latestWorkflow.name}.`
              : "Create your first workflow to begin tracking updates here."}
          </p>
        </div>
        <div className="rounded-[28px] border border-orange-200/80 bg-[linear-gradient(180deg,rgba(255,247,237,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_24px_60px_-32px_rgba(249,115,22,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-700">
            Phase 1
          </p>
          <p className="mt-3 text-lg font-semibold text-slate-950">
            Structure now, canvas next
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This release keeps the workflow system tight and usable while leaving room
            for React Flow and AI execution in later phases.
          </p>
        </div>
      </section>

      <WorkflowList workflows={workflows} />
    </div>
  );
}
