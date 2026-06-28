export interface WorkflowNodePosition {
  x: number;
  y: number;
}

export type TriggerType = "Manual" | "Webhook" | "File Upload";

export type AIActionType =
  | "Summarize"
  | "Rewrite"
  | "Classify"
  | "Extract"
  | "Generate";

export type ActionType = "Save Output" | "Log Result" | "Display";

export interface TriggerNodeData {
  label: string;
  type: TriggerType;
  inputText?: string;
}

export interface AINodeData {
  label: string;
  action: AIActionType;
  prompt: string;
}

export interface RouterNodeData {
  label: string;
  prompt: string;
}

export interface ActionNodeData {
  label: string;
  action: ActionType;
}

export interface LookupNodeData {
  label: string;
  query: string;
  maxResults: number;
}

export type WorkflowNodeData =
  | TriggerNodeData
  | AINodeData
  | RouterNodeData
  | ActionNodeData
  | LookupNodeData;

export interface WorkflowNode<TData = WorkflowNodeData> {
  id: string;
  type: string;
  position: WorkflowNodePosition;
  data: TData;
  style?: { width?: number; height?: number };
}

export interface WorkflowEdge<TData = Record<string, unknown>> {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: TData;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  graph: WorkflowGraph;
  created_at: string;
  updated_at: string;
}

export interface ExecutionLogRow {
  id: string;
  workflow_id: string;
  user_id: string;
  ran_at: string;
  node_results: Array<{
    nodeId: string;
    status: "idle" | "running" | "complete" | "error";
    output: string;
    durationMs?: number;
  }>;
}

export interface WorkflowWithLastRun extends Workflow {
  last_run_at: string | null;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  user_id: string;
  status: "success" | "error";
  final_output: string | null;
  node_outputs: Array<{
    nodeId: string;
    status: string;
    output: string;
    durationMs?: number;
  }> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
