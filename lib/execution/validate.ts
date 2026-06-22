import type { Edge, Node } from "reactflow";
import type { AINodeData, LookupNodeData, RouterNodeData, WorkflowNodeData } from "@/lib/types";
import { topologicalSort } from "@/lib/execution/topologicalSort";

type WorkflowNode = Node<WorkflowNodeData>;

export interface WorkflowValidationResult {
  valid: boolean;
  nodeErrors: Record<string, string>;
  globalError?: string;
}

function getReachableNodeIds(nodes: WorkflowNode[], edges: Edge[]): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  const reachable = new Set<string>();
  const queue = nodes
    .filter((n) => n.type === "triggerNode")
    .map((n) => n.id);

  for (const id of queue) {
    reachable.add(id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const targetId of adjacency.get(id) ?? []) {
      if (!reachable.has(targetId)) {
        reachable.add(targetId);
        queue.push(targetId);
      }
    }
  }

  return reachable;
}

export function validateWorkflow(
  nodes: WorkflowNode[],
  edges: Edge[]
): WorkflowValidationResult {
  if (!nodes.some((n) => n.type === "triggerNode")) {
    return {
      valid: false,
      nodeErrors: {},
      globalError: "Add a Trigger node to start the workflow."
    };
  }

  const reachableIds = getReachableNodeIds(nodes, edges);
  const reachableNodes = nodes.filter((n) => reachableIds.has(n.id));
  const reachableEdges = edges.filter(
    (e) => reachableIds.has(e.source) && reachableIds.has(e.target)
  );

  try {
    topologicalSort(reachableNodes, reachableEdges);
  } catch {
    return {
      valid: false,
      nodeErrors: {},
      globalError:
        "The workflow contains a cycle — remove the circular connection to continue."
    };
  }

  const nodeErrors: Record<string, string> = {};

  for (const node of reachableNodes) {
    if (node.type === "aiNode") {
      const data = node.data as AINodeData;
      if (!data.prompt?.trim()) {
        nodeErrors[node.id] = `"${data.label || "AI node"}" needs a prompt before it can run.`;
      }
    }

    if (node.type === "routerNode") {
      const data = node.data as RouterNodeData;
      if (!data.prompt?.trim()) {
        nodeErrors[node.id] = `"${data.label || "Router"}" needs a condition before it can run.`;
      }
    }

    if (node.type === "lookupNode") {
      const data = node.data as LookupNodeData;
      if (!data.query?.trim()) {
        nodeErrors[node.id] = `"${data.label || "Lookup"}" needs a search query before it can run.`;
      }
    }
  }

  return { valid: Object.keys(nodeErrors).length === 0, nodeErrors };
}
