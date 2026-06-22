"use client";

import { createContext, useContext } from "react";
import type { NodeExecutionState } from "@/lib/execution/types";

interface ExecutionContextValue {
  nodeStates: Record<string, NodeExecutionState>;
}

const ExecutionContext = createContext<ExecutionContextValue>({
  nodeStates: {}
});

export function ExecutionProvider({
  children,
  nodeStates
}: {
  children: React.ReactNode;
  nodeStates: Record<string, NodeExecutionState>;
}) {
  return (
    <ExecutionContext.Provider value={{ nodeStates }}>
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
