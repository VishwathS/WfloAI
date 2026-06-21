"use client";

import { useMemo, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { executeWorkflow } from "@/lib/execution/executor";
import { validateWorkflow } from "@/lib/execution/validate";
import type { ExecutionLogEntry, NodeExecutionState } from "@/lib/execution/types";
import type {
  ActionNodeData,
  AINodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";

type WorkflowCanvasNode = Node<
  TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData
>;

const IDLE_STATE: NodeExecutionState = {
  status: "idle",
  output: ""
};

export function useExecution(
  workflowId: string,
  nodes: WorkflowCanvasNode[],
  edges: Edge[]
) {
  const [isRunning, setIsRunning] = useState(false);
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const executionResultsRef = useRef<Record<string, ExecutionLogEntry>>({});

  const hydratedNodeStates = useMemo(() => {
    return nodes.reduce<Record<string, NodeExecutionState>>((accumulator, node) => {
      accumulator[node.id] = nodeStates[node.id] ?? IDLE_STATE;
      return accumulator;
    }, {});
  }, [nodeStates, nodes]);

  async function persistExecutionLog(nodeResults: ExecutionLogEntry[]) {
    const response = await fetch(`/api/workflows/${workflowId}/logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        node_results: nodeResults
      })
    });

    if (!response.ok) {
      throw new Error("Failed to persist execution log.");
    }
  }

  async function run() {
    if (isRunning) {
      return;
    }

    setRunError(null);

    const validation = validateWorkflow(nodes, edges);
    if (!validation.valid) {
      if (validation.globalError) {
        setRunError(validation.globalError);
      }
      if (Object.keys(validation.nodeErrors).length > 0) {
        setNodeStates(
          Object.fromEntries(
            Object.entries(validation.nodeErrors).map(([id, msg]) => [
              id,
              { status: "error" as const, output: "", error: msg }
            ])
          )
        );
      }
      return;
    }

    setIsRunning(true);
    setNodeStates({});
    executionResultsRef.current = {};

    try {
      await executeWorkflow(nodes, edges, (event) => {
        if (event.type === "node:start") {
          executionResultsRef.current[event.nodeId] = {
            nodeId: event.nodeId,
            status: "running",
            output: ""
          };

          setNodeStates((currentState) => ({
            ...currentState,
            [event.nodeId]: {
              status: "running",
              output: ""
            }
          }));
          return;
        }

        if (event.type === "node:output") {
          const currentResult = executionResultsRef.current[event.nodeId] ?? {
            nodeId: event.nodeId,
            status: "running",
            output: ""
          };

          executionResultsRef.current[event.nodeId] = {
            ...currentResult,
            status: "running",
            output: `${currentResult.output}${event.chunk}`
          };

          setNodeStates((currentState) => ({
            ...currentState,
            [event.nodeId]: {
              ...(currentState[event.nodeId] ?? IDLE_STATE),
              status: "running",
              output: `${currentState[event.nodeId]?.output ?? ""}${event.chunk}`
            }
          }));
          return;
        }

        if (event.type === "node:complete") {
          executionResultsRef.current[event.nodeId] = {
            nodeId: event.nodeId,
            status: "complete",
            output: event.output,
            durationMs: event.durationMs
          };

          setNodeStates((currentState) => ({
            ...currentState,
            [event.nodeId]: {
              status: "complete",
              output: event.output,
              durationMs: event.durationMs
            }
          }));
          return;
        }

        if (event.type === "node:skip") {
          executionResultsRef.current[event.nodeId] = {
            nodeId: event.nodeId,
            status: "skipped",
            output: "Skipped — branch not selected"
          };
          setNodeStates((currentState) => ({
            ...currentState,
            [event.nodeId]: {
              status: "skipped",
              output: "Skipped — branch not selected"
            }
          }));
          return;
        }

        if (event.type === "node:error") {
          const currentResult = executionResultsRef.current[event.nodeId] ?? {
            nodeId: event.nodeId,
            status: "error",
            output: ""
          };

          executionResultsRef.current[event.nodeId] = {
            ...currentResult,
            status: "error"
          };

          setNodeStates((currentState) => ({
            ...currentState,
            [event.nodeId]: {
              ...(currentState[event.nodeId] ?? IDLE_STATE),
              status: "error",
              error: event.error
            }
          }));
          return;
        }

        if (event.type === "workflow:done") {
          const nodeResults = Object.values(executionResultsRef.current).map((result) => ({
            nodeId: result.nodeId,
            status: result.status,
            output: result.output,
            durationMs: result.durationMs
          }));

          void persistExecutionLog(nodeResults);
        }
      });
    } finally {
      setIsRunning(false);
    }
  }

  return {
    run,
    isRunning,
    nodeStates: hydratedNodeStates,
    runError
  };
}
