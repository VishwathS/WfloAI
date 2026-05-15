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
}

export interface AINodeData {
  label: string;
  action: AIActionType;
  prompt: string;
}

export interface ActionNodeData {
  label: string;
  action: ActionType;
}

export type WorkflowNodeData = TriggerNodeData | AINodeData | ActionNodeData;

export interface WorkflowNode<TData = WorkflowNodeData> {
  id: string;
  type: string;
  position: WorkflowNodePosition;
  data: TData;
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
