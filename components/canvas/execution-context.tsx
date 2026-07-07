"use client";

import { createContext, useContext } from "react";
import type { NodeExecutionState } from "@/lib/execution/types";

interface ExecutionContextValue {
  nodeStates: Record<string, NodeExecutionState>;
  isWorkflowRunning: boolean;
  isRunSettled: boolean;
}

const ExecutionContext = createContext<ExecutionContextValue>({
  nodeStates: {},
  isWorkflowRunning: false,
  isRunSettled: false
});

export function ExecutionProvider({
  children,
  nodeStates,
  isWorkflowRunning,
  isRunSettled
}: {
  children: React.ReactNode;
  nodeStates: Record<string, NodeExecutionState>;
  isWorkflowRunning: boolean;
  isRunSettled: boolean;
}) {
  return (
    <ExecutionContext.Provider value={{ nodeStates, isWorkflowRunning, isRunSettled }}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useNodeExecutionState(nodeId: string): NodeExecutionState {
  const { nodeStates, isRunSettled } = useContext(ExecutionContext);

  const state = nodeStates[nodeId] ?? {
    status: "idle" as const,
    output: ""
  };

  if (isRunSettled && (state.status === "complete" || state.status === "error")) {
    return { ...state, status: "idle" };
  }

  return state;
}

export function useNodeStates(): Record<string, NodeExecutionState> {
  return useContext(ExecutionContext).nodeStates;
}

export function useIsWorkflowRunning(): boolean {
  return useContext(ExecutionContext).isWorkflowRunning;
}
