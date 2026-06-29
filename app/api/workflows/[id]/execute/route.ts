import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateWorkflow } from "@/lib/execution/validate";
import { executeWorkflow } from "@/lib/execution/serverExecutor";
import type { ExecutionEvent, ExecutionLogEntry } from "@/lib/execution/types";
import type { WorkflowGraph, WorkflowNodeData } from "@/lib/types";
import type { Node, Edge } from "reactflow";

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflows")
    .select("graph")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (workflowError) {
    return NextResponse.json({ error: workflowError.message }, { status: 500 });
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const { nodes, edges } = workflow.graph as WorkflowGraph;

  // WorkflowNode/WorkflowEdge are structurally compatible with reactflow's Node/Edge;
  // cast needed because they come from different type declarations.
  const rfNodes = nodes as unknown as Node<WorkflowNodeData>[];
  const rfEdges = edges as unknown as Edge[];

  const validation = validateWorkflow(rfNodes, rfEdges);

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.globalError ?? "Invalid workflow", nodeErrors: validation.nodeErrors },
      { status: 400 }
    );
  }

  const startedAt = new Date().toISOString();
  const encoder = new TextEncoder();
  const executionResults = new Map<string, ExecutionLogEntry>();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: ExecutionEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        await executeWorkflow(rfNodes, rfEdges, (event) => {
          if (event.type === "node:start") {
            executionResults.set(event.nodeId, { nodeId: event.nodeId, status: "running", output: "" });
          } else if (event.type === "node:output") {
            const cur = executionResults.get(event.nodeId) ?? {
              nodeId: event.nodeId,
              status: "running",
              output: ""
            };
            executionResults.set(event.nodeId, { ...cur, output: cur.output + event.chunk });
          } else if (event.type === "node:complete") {
            executionResults.set(event.nodeId, {
              nodeId: event.nodeId,
              status: "complete",
              output: event.output,
              durationMs: event.durationMs
            });
          } else if (event.type === "node:error") {
            const cur = executionResults.get(event.nodeId) ?? {
              nodeId: event.nodeId,
              status: "error",
              output: ""
            };
            executionResults.set(event.nodeId, { ...cur, status: "error", output: cur.output || event.error });
          }

          try {
            send(event);
          } catch {
            // client disconnected; execution continues server-side
          }
        });

        const nodeResults = Array.from(executionResults.values());
        const hasError = nodeResults.some((r) => r.status === "error");
        const finalOutput =
          [...nodeResults].reverse().find((r) => r.status === "complete" && r.output)?.output ?? null;
        const runError = nodeResults.find((r) => r.status === "error")?.output ?? null;

        await supabase.from("workflow_runs").insert({
          workflow_id: params.id,
          user_id: user.id,
          status: hasError ? "error" : "success",
          final_output: finalOutput,
          node_outputs: nodeResults,
          error: runError,
          started_at: startedAt,
          completed_at: new Date().toISOString()
        });
      } catch {
        // node:error already sent for the failing node; stream closes cleanly
      } finally {
        try { controller.close(); } catch { /* already closed by client disconnect */ }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
