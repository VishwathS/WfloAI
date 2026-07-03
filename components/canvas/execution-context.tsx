"use client";

import { createContext, useContext } from "react";
import type { NodeExecutionState } from "@/lib/execution/types";

interface ExecutionContextValue {
  nodeStates: Record<string, NodeExecutionState>;
  isWorkflowRunning: boolean;
}

const ExecutionContext = createContext<ExecutionContextValue>({
  nodeStates: {},
  isWorkflowRunning: false
});

export function ExecutionProvider({
  children,
  nodeStates,
  isWorkflowRunning
}: {
  children: React.ReactNode;
  nodeStates: Record<string, NodeExecutionState>;
  isWorkflowRunning: boolean;
}) {
  return (
    <ExecutionContext.Provider value={{ nodeStates, isWorkflowRunning }}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useNodeExecutionState(nodeId: string): NodeExecutionState {
  const { nodeStates } = useContext(ExecutionContext);

  return (
    nodeStates[nodeId] ?? {
      status: "idle",
      output: ""
    }
  );
}

export function useNodeStates(): Record<string, NodeExecutionState> {
  return useContext(ExecutionContext).nodeStates;
}

export function useIsWorkflowRunning(): boolean {
  return useContext(ExecutionContext).isWorkflowRunning;
}
