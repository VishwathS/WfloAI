import type { Edge, Node } from "reactflow";
import type {
  ActionNodeData,
  AINodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";
import type { ExecutionEvent, NodeExecutionResult } from "@/lib/execution/types";
import { topologicalSort } from "@/lib/execution/topologicalSort";

type WorkflowCanvasNode = Node<
  TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData
>;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildParentContext(
  nodeId: string,
  edges: Edge[],
  outputsByNodeId: Map<string, string>
) {
  const parentOutputs = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => outputsByNodeId.get(edge.source)?.trim())
    .filter((output): output is string => Boolean(output));

  return parentOutputs.join("\n\n");
}

async function requestAIText(prompt: string, context: string, nodeId: string, onEvent?: (event: ExecutionEvent) => void) {
  const response = await fetch("/api/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      context
    })
  });

  if (!response.ok || !response.body) {
    throw new Error("Failed to execute AI node.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });

    if (!chunk) {
      continue;
    }

    output += chunk;
    onEvent?.({
      type: "node:output",
      nodeId,
      chunk
    });
  }

  output += decoder.decode();
  return output;
}

async function executeAINode(
  node: WorkflowCanvasNode,
  context: string,
  onEvent: (event: ExecutionEvent) => void | Promise<void>
): Promise<NodeExecutionResult> {
  const data = node.data as AINodeData;
  return { output: await requestAIText(data.prompt, context, node.id, onEvent) };
}

async function executeRouterNode(node: WorkflowCanvasNode, context: string): Promise<NodeExecutionResult> {
  const data = node.data as RouterNodeData;
  const routerInstruction = `${data.prompt}

Respond with ONLY "true" or "false". Do not include any explanation or punctuation.`;
  const decision = await requestAIText(routerInstruction, context, node.id);
  const normalizedDecision = decision.trim().toLowerCase();

  if (normalizedDecision !== "true" && normalizedDecision !== "false") {
    throw new Error('Router node must respond with only "true" or "false".');
  }

  return { output: context, route: normalizedDecision };
}

function collectInactiveBranchNodes(
  inactiveTargets: string[],
  edges: Edge[],
  nodeMap: Map<string, WorkflowCanvasNode>
): Set<string> {
  const skipped = new Set<string>();
  const queue = [...inactiveTargets];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!nodeMap.has(id) || skipped.has(id)) continue;
    skipped.add(id);
    for (const edge of edges) {
      if (edge.source === id && !skipped.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }
  return skipped;
}

export async function executeWorkflow(
  nodes: WorkflowCanvasNode[],
  edges: Edge[],
  onEvent: (event: ExecutionEvent) => void | Promise<void>
): Promise<void> {
  const orderedNodes = topologicalSort(nodes, edges);
  const nodeMap = new Map(orderedNodes.map((node) => [node.id, node]));
  const outputsByNodeId = new Map<string, string>();
  const activeIncomingEdgesByNodeId = new Map<string, Edge[]>();
  const executedNodeIds = new Set<string>();
  const inactiveBranchNodeIds = new Set<string>();

  function appendActiveEdges(nextEdges: Edge[]) {
    for (const edge of nextEdges) {
      if (!nodeMap.has(edge.target)) {
        continue;
      }

      const currentEdges = activeIncomingEdgesByNodeId.get(edge.target) ?? [];
      activeIncomingEdgesByNodeId.set(edge.target, currentEdges.concat(edge));
    }
  }

  for (const node of orderedNodes) {
    const activeIncomingEdges =
      node.type === "triggerNode" ? [] : activeIncomingEdgesByNodeId.get(node.id) ?? [];

    if (node.type !== "triggerNode" && activeIncomingEdges.length === 0) {
      continue;
    }

    if (
      activeIncomingEdges.some((edge) => !executedNodeIds.has(edge.source))
    ) {
      continue;
    }

    const startedAt = Date.now();

    try {
      await onEvent({
        type: "node:start",
        nodeId: node.id
      });

      const parentContext = buildParentContext(node.id, activeIncomingEdges, outputsByNodeId);
      let result: NodeExecutionResult;

      if (node.type === "triggerNode") {
        await delay(400);
        result = { output: (node.data as TriggerNodeData).inputText?.trim() || "Workflow triggered." };
      } else if (node.type === "routerNode") {
        result = await executeRouterNode(node, parentContext);
      } else if (node.type === "actionNode") {
        await delay(300);
        result = { output: "Output saved." };
      } else if (node.type === "aiNode") {
        result = await executeAINode(node, parentContext, onEvent);
      } else {
        throw new Error(`Unsupported node type: ${node.type}`);
      }

      outputsByNodeId.set(node.id, result.output);
      executedNodeIds.add(node.id);

      if (node.type === "routerNode") {
        appendActiveEdges(
          edges.filter(
            (edge) => edge.source === node.id && edge.sourceHandle === result.route
          )
        );
        const inactiveTargets = edges
          .filter((edge) => edge.source === node.id && edge.sourceHandle !== result.route)
          .map((edge) => edge.target);
        for (const id of collectInactiveBranchNodes(inactiveTargets, edges, nodeMap)) {
          inactiveBranchNodeIds.add(id);
        }
      } else {
        appendActiveEdges(edges.filter((edge) => edge.source === node.id));
      }

      await onEvent({
        type: "node:complete",
        nodeId: node.id,
        output: result.output,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed.";

      await onEvent({
        type: "node:error",
        nodeId: node.id,
        error: message
      });

      throw error;
    }
  }

  for (const nodeId of inactiveBranchNodeIds) {
    if (!executedNodeIds.has(nodeId)) {
      await onEvent({ type: "node:skip", nodeId });
    }
  }

  await onEvent({
    type: "workflow:done"
  });
}
