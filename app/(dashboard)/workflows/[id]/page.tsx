import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { WorkflowCanvasShell } from "@/components/canvas/WorkflowCanvasShell";
import { WorkflowTitleEditor } from "@/components/workflows/workflow-title-editor";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/lib/types";

export const dynamic = "force-dynamic";

interface WorkflowPageProps {
  params: {
    id: string;
  };
}

function normalizeGraph(graph: Workflow["graph"]) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges)
    ? graph.edges.map((edge) => ({
        ...edge,
        type: "smoothstep",
        animated: true
      }))
    : [];

  return { nodes, edges };
}

export default async function WorkflowPage({ params }: WorkflowPageProps) {
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
    .eq("id", params.id)
    .single();

  if (error || !data) {
    notFound();
  }

  const workflow = data as Workflow;
  const graph = normalizeGraph(workflow.graph);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-8 w-fit px-0 text-sm text-slate-600 hover:text-slate-950"
            )}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
        <div className="min-w-0 flex-1 space-y-2 sm:max-w-3xl">
          <WorkflowTitleEditor workflowId={workflow.id} initialName={workflow.name} />
          <p className="text-sm leading-6 text-slate-600">
            Arrange triggers, AI steps, and terminal actions visually, then save the
            workflow graph back to Supabase.
          </p>
        </div>
      </div>

      <WorkflowCanvasShell
        workflowId={workflow.id}
        workflowName={workflow.name}
        initialNodes={graph.nodes}
        initialEdges={graph.edges}
      />
    </div>
  );
}
