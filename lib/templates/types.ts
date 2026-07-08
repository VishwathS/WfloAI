import type { WorkflowGraph } from "@/lib/types";

export type TemplateCategory =
  | "Content Creation"
  | "Research"
  | "Sales / Outbound"
  | "Recruiting"
  | "Client Work"
  | "Productivity";

export type TemplateComplexity = "Simple" | "Intermediate" | "Advanced";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  complexity: TemplateComplexity;
  graph: WorkflowGraph;
}
