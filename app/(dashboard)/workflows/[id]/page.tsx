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
        animated: false
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
    <div className="flex h-[calc(100vh-2rem)] min-h-[600px] flex-col gap-3 p-4 lg:px-6 lg:pt-4">
      <div className="min-w-0">
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-7 w-fit px-0 text-xs text-gray-500 hover:bg-transparent hover:text-gray-900"
          )}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to dashboard
        </Link>
        <WorkflowTitleEditor workflowId={workflow.id} initialName={workflow.name} />
        <p className="mt-0.5 text-sm text-gray-500">
          Arrange triggers, AI steps, and actions visually.
        </p>
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
