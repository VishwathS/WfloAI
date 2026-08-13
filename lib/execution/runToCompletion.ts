import type { Edge, Node } from "reactflow";
import { executeWorkflow } from "@/lib/execution/serverExecutor";
import type { ExecutionLogEntry } from "@/lib/execution/types";
import type { IntegrationContext } from "@/lib/integrations/types";
import type { WorkflowNodeData } from "@/lib/types";

export interface CollectedRun {
  status: "success" | "error";
  final_output: string | null;
  node_outputs: ExecutionLogEntry[];
  error: string | null;
  started_at: string;
  completed_at: string;
}

export async function runWorkflowToCompletion(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  integrationContext?: IntegrationContext
): Promise<CollectedRun> {
  const startedAt = new Date().toISOString();
  const executionResults = new Map<string, ExecutionLogEntry>();

  try {
    await executeWorkflow(nodes, edges, (event) => {
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
    }, integrationContext);
  } catch {
    // node:error already recorded for the failing node
  }

  const nodeResults = Array.from(executionResults.values());
  const hasError = nodeResults.some((r) => r.status === "error");
  const finalOutput =
    [...nodeResults].reverse().find((r) => r.status === "complete" && r.output)?.output ?? null;
  const runError = nodeResults.find((r) => r.status === "error")?.output ?? null;

  return {
    status: hasError ? "error" : "success",
    final_output: finalOutput,
    node_outputs: nodeResults,
    error: runError,
    started_at: startedAt,
    completed_at: new Date().toISOString()
  };
}
