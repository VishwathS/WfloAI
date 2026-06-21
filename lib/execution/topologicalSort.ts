import type { Edge, Node } from "reactflow";

export function topologicalSort<TNodeData = unknown>(
  nodes: Node<TNodeData>[],
  edges: Edge[]
): Node<TNodeData>[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingCount = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    incomingCount.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }

    adjacency.get(edge.source)?.push(edge.target);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const sorted: Node<TNodeData>[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      continue;
    }

    const node = nodeMap.get(nodeId);

    if (!node) {
      continue;
    }

    sorted.push(node);

    for (const neighborId of adjacency.get(nodeId) ?? []) {
      const nextCount = (incomingCount.get(neighborId) ?? 0) - 1;
      incomingCount.set(neighborId, nextCount);

      if (nextCount === 0) {
        queue.push(neighborId);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error("Workflow graph contains a cycle.");
  }

  return sorted;
}
