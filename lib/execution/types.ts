export type ExecutionEvent =
  | { type: "node:start"; nodeId: string }
  | { type: "node:output"; nodeId: string; chunk: string }
  | { type: "node:complete"; nodeId: string; output: string; durationMs: number }
  | { type: "node:error"; nodeId: string; error: string }
  | { type: "node:skip"; nodeId: string }
  | { type: "workflow:done" };

export interface NodeExecutionState {
  status: "idle" | "running" | "complete" | "error" | "skipped";
  output: string;
  durationMs?: number;
  error?: string;
}

export interface ExecutionLogEntry {
  nodeId: string;
  status: NodeExecutionState["status"];
  output: string;
  durationMs?: number;
}

export type NodeExecutionResult = {
  output: string;
  route?: string;
  metadata?: Record<string, unknown>;
};
