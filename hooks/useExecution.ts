"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "reactflow";
import { validateWorkflow } from "@/lib/execution/validate";
import type { ExecutionEvent, ExecutionLogEntry, NodeExecutionState } from "@/lib/execution/types";
import type {
  ActionNodeData,
  AINodeData,
  FileInputNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";

type WorkflowCanvasNode = Node<
  | TriggerNodeData
  | AINodeData
  | RouterNodeData
  | ActionNodeData
  | LookupNodeData
  | InputNodeData
  | FileInputNodeData
>;

const IDLE_STATE: NodeExecutionState = {
  status: "idle",
  output: ""
};

const SETTLE_DELAY_SUCCESS_MS = 1500;
const SETTLE_DELAY_ERROR_MS = 4000;

export function useExecution(
  workflowId: string,
  nodes: WorkflowCanvasNode[],
  edges: Edge[],
  onRunSaved?: () => void
) {
  const [isRunning, setIsRunning] = useState(false);
  const [isRunSettled, setIsRunSettled] = useState(false);
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const executionResultsRef = useRef<Record<string, ExecutionLogEntry>>({});
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) {
        clearTimeout(settleTimeoutRef.current);
      }
    };
  }, []);

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

  function handleEvent(event: ExecutionEvent) {
    if (event.type === "node:start") {
      executionResultsRef.current[event.nodeId] = {
        nodeId: event.nodeId,
        status: "running",
        output: ""
      };

      setNodeStates((currentState) => ({
        ...currentState,
        [event.nodeId]: { status: "running", output: "" }
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

    if (event.type === "node:error") {
      const currentResult = executionResultsRef.current[event.nodeId] ?? {
        nodeId: event.nodeId,
        status: "error",
        output: ""
      };

      executionResultsRef.current[event.nodeId] = { ...currentResult, status: "error", output: currentResult.output || event.error };

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
  }

  async function run(graph?: { nodes: WorkflowCanvasNode[]; edges: Edge[] }) {
    if (isRunning) {
      return;
    }

    setRunError(null);

    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    setIsRunSettled(false);

    const validation = validateWorkflow(graph?.nodes ?? nodes, graph?.edges ?? edges);
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
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (!response.ok || !response.body) {
        setRunError("Execution request failed. Please try again.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const event = JSON.parse(dataLine.slice(6)) as ExecutionEvent;
            handleEvent(event);
          } catch {
            // malformed SSE frame; skip
          }
        }
      }

      onRunSaved?.();
    } catch {
      // network error; node states already reflect any partial progress
    } finally {
      setIsRunning(false);

      const hasErroredNode = Object.values(executionResultsRef.current).some(
        (result) => result.status === "error"
      );
      settleTimeoutRef.current = setTimeout(
        () => setIsRunSettled(true),
        hasErroredNode ? SETTLE_DELAY_ERROR_MS : SETTLE_DELAY_SUCCESS_MS
      );
    }
  }

  return {
    run,
    isRunning,
    isRunSettled,
    nodeStates: hydratedNodeStates,
    runError
  };
}
