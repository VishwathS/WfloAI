import { NextResponse } from "next/server";
import { apiError } from "@/lib/observability/apiError";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability/report";
import { validateWorkflow } from "@/lib/execution/validate";
import { executeWorkflow } from "@/lib/execution/serverExecutor";
import { resolveFileInputs } from "@/lib/execution/resolveFileInputs";
import type { ExecutionEvent, ExecutionLogEntry } from "@/lib/execution/types";
import type { WorkflowGraph, WorkflowNodeData } from "@/lib/types";
import type { Node, Edge } from "reactflow";
import { EXECUTE_ROUTE_MAX_DURATION_SECONDS } from "@/lib/execution/constants";

// A11 Phase 1. Without this the platform default applies, and when it fires
// mid-execution the request is severed before the workflow_runs row is written:
// a run that happened, cost money and possibly sent email, with no record of it.
//
// Next 16 requires segment config exports to be statically analyzable literals,
// so this cannot reference EXECUTE_ROUTE_MAX_DURATION_SECONDS directly. That
// constant remains the documented source of the value and is pinned to this
// literal by tests/executionLimits.test.ts.
export const maxDuration = 300;

// Leaves headroom inside maxDuration for the workflow_runs write.
const RUN_BUDGET_MS = (EXECUTE_ROUTE_MAX_DURATION_SECONDS - 30) * 1000;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Rejects shortly before the platform would sever the request at maxDuration,
// leaving room for the persistence write. executeWorkflow is not cancellable,
// so it may keep running until the platform stops it — but the run is recorded
// either way, which is the failure mode A11 is about.
function createRuntimeBudget() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("This run exceeded the maximum execution time and was stopped.")),
      RUN_BUDGET_MS
    );
  });
  // Nothing awaits expiry on the success path; without this the rejection would
  // surface as an unhandled rejection after the run finishes.
  expiry.catch(() => {});
  return { expiry, cancel: () => clearTimeout(timer) };
}

export async function POST(_request: Request, context: RouteContext) {
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
    .select("graph")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (workflowError) {
    return apiError("api.workflows.execute.workflow_lookup_failed", workflowError);
  }

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const { nodes, edges } = workflow.graph as WorkflowGraph;

  // WorkflowNode/WorkflowEdge are structurally compatible with reactflow's Node/Edge;
  // cast needed because they come from different type declarations.
  const rfNodes = await resolveFileInputs(
    nodes as unknown as Node<WorkflowNodeData>[],
    supabase,
    user.id
  );
  const rfEdges = edges as unknown as Edge[];

  const validation = validateWorkflow(rfNodes, rfEdges);

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.globalError ?? "Invalid workflow", nodeErrors: validation.nodeErrors },
      { status: 400 }
    );
  }

  const startedAt = new Date().toISOString();
  // Generated before execution so integration idempotency keys exist for this
  // run; reused as the workflow_runs primary key.
  const runId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const executionResults = new Map<string, ExecutionLogEntry>();

  const runtimeBudget = createRuntimeBudget();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(event: ExecutionEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      let runFailure: unknown = null;

      try {
        // A11: a total runtime cap enforced here rather than inside the
        // executor — restructuring serverExecutor or the SSE machinery is an
        // explicit Stop Condition for this task. Racing the budget means the
        // route reaches its persistence path *before* the platform severs the
        // request at maxDuration, which is what turns an invisible truncated
        // write into a legible error run.
        await Promise.race([
          executeWorkflow(rfNodes, rfEdges, (event) => {
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
          }, {
            supabase,
            userId: user.id,
            workflowId: params.id,
            runId,
            actionsUsed: { count: 0 }
          }),
          runtimeBudget.expiry
        ]);
      } catch (error) {
        runFailure = error;
        // node:error was already streamed for the failing node, so the client
        // is informed — but the operator never was.
        reportError("api.workflows.execute.stream_failed", error, {
          workflowId: params.id,
          runId
        });
      } finally {
        runtimeBudget.cancel();
      }

      // A11: persist OUTSIDE the try. Previously any throw out of
      // executeWorkflow — which is every node failure, since serverExecutor
      // rethrows after emitting node:error — skipped this insert entirely, so a
      // failed manual run left no workflow_runs row at all. A run that happened,
      // spent money and possibly sent email must leave a record.
      try {
        const nodeResults = Array.from(executionResults.values());
        const hasError = nodeResults.some((r) => r.status === "error") || runFailure !== null;
        const finalOutput =
          [...nodeResults].reverse().find((r) => r.status === "complete" && r.output)?.output ?? null;
        const runError =
          nodeResults.find((r) => r.status === "error")?.output ??
          (runFailure instanceof Error ? runFailure.message : runFailure ? String(runFailure) : null);

        await supabase.from("workflow_runs").insert({
          id: runId,
          workflow_id: params.id,
          user_id: user.id,
          status: hasError ? "error" : "success",
          final_output: finalOutput,
          node_outputs: nodeResults,
          error: runError,
          trigger: "manual",
          started_at: startedAt,
          completed_at: new Date().toISOString()
        });
      } catch (error) {
        reportError("api.workflows.execute.persist_failed", error, {
          workflowId: params.id,
          runId
        });
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
