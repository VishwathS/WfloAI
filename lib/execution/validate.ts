import type { Edge, Node } from "reactflow";
import type {
  AINodeData,
  FileInputNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  WorkflowNodeData
} from "@/lib/types";
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
    .filter(
      (n) => n.type === "triggerNode" || n.type === "inputNode" || n.type === "fileInputNode"
    )
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
  const hasEntry = nodes.some(
    (n) => n.type === "triggerNode" || n.type === "inputNode" || n.type === "fileInputNode"
  );
  if (!hasEntry) {
    return {
      valid: false,
      nodeErrors: {},
      globalError: "Add an Input node to provide data for your workflow."
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

    if (node.type === "fileInputNode") {
      const data = node.data as FileInputNodeData;
      if (!data.fileId) {
        nodeErrors[node.id] = `"${data.label || "File Input"}" needs an uploaded file before it can run.`;
      }
    }

    if (node.type === "inputNode") {
      const data = node.data as InputNodeData;
      if (!data.key?.trim()) {
        nodeErrors[node.id] = `"${data.label || "Input"}" needs a key before it can run.`;
      } else if ((data.required ?? true) && !data.defaultValue?.trim()) {
        nodeErrors[node.id] = `"${data.label || "Input"}" (key: ${data.key}) needs a value before it can run.`;
      }
    }
  }

  // Duplicate-key check across all reachable Input nodes.
  const inputKeyCounts = new Map<string, number>();
  for (const node of reachableNodes) {
    if (node.type === "inputNode") {
      const key = (node.data as InputNodeData).key?.trim();
      if (key) inputKeyCounts.set(key, (inputKeyCounts.get(key) ?? 0) + 1);
    }
  }
  for (const node of reachableNodes) {
    if (node.type === "inputNode" && !nodeErrors[node.id]) {
      const key = (node.data as InputNodeData).key?.trim();
      if (key && (inputKeyCounts.get(key) ?? 0) > 1) {
        nodeErrors[node.id] = `Input key "${key}" is used by more than one Input node — keys must be unique.`;
      }
    }
  }

  // Ensure every {{key}} token in AI/Router prompts resolves to a defined Input node.
  const availableKeys = new Set(
    reachableNodes
      .filter((n) => n.type === "inputNode")
      .map((n) => (n.data as InputNodeData).key?.trim())
      .filter((k): k is string => Boolean(k))
  );
  for (const node of reachableNodes) {
    if ((node.type === "aiNode" || node.type === "routerNode") && !nodeErrors[node.id]) {
      const prompt = (node.data as AINodeData | RouterNodeData).prompt ?? "";
      const missing = [...prompt.matchAll(/\{\{(\w+)\}\}/g)]
        .map((m) => m[1])
        .filter((key) => key !== "previousOutput" && !availableKeys.has(key));
      if (missing.length > 0) {
        const data = node.data as AINodeData | RouterNodeData;
        if (missing.includes("input")) {
          nodeErrors[node.id] =
            `"${data.label || "Node"}" uses {{input}}, which is deprecated — use {{previousOutput}} for the upstream node's output.`;
        } else {
          const available = [...availableKeys, "previousOutput"].map((k) => `{{${k}}}`).join(", ");
          nodeErrors[node.id] =
            `"${data.label || "Node"}" references undefined input(s): ${missing.map((k) => `{{${k}}}`).join(", ")}. Available: ${available}.`;
        }
      }
    }
  }

  return { valid: Object.keys(nodeErrors).length === 0, nodeErrors };
}
