import Anthropic from "@anthropic-ai/sdk";
import type { Edge, Node } from "reactflow";
import type {
  ActionNodeData,
  AINodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";
import type { ExecutionEvent, NodeExecutionResult } from "@/lib/execution/types";
import { topologicalSort } from "@/lib/execution/topologicalSort";

type WorkflowCanvasNode = Node<
  TriggerNodeData | AINodeData | RouterNodeData | ActionNodeData | LookupNodeData
>;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  query: string;
  results: TavilyResult[];
}

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

function buildPrompt(prompt: string, context: string) {
  return `Context from previous step:\n${context}\n\nInstruction:\n${prompt}`;
}

function formatLookupResults(query: string, results: TavilyResult[]): string {
  const lines: string[] = [`Search results for "${query}":`, ""];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. Title: ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    lines.push(`   Content: ${r.content}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

async function requestAIText(
  prompt: string,
  context: string,
  nodeId: string,
  onEvent?: (event: ExecutionEvent) => void
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: buildPrompt(prompt, context) }]
  });

  let output = "";

  await new Promise<void>((resolve, reject) => {
    stream.on("text", (text) => {
      output += text;
      onEvent?.({ type: "node:output", nodeId, chunk: text });
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return output;
}

async function executeLookupNode(
  node: WorkflowCanvasNode,
  context: string,
  onEvent: (event: ExecutionEvent) => void
): Promise<NodeExecutionResult> {
  const data = node.data as LookupNodeData;
  const query = data.query.replace(/\{\{input\}\}/g, context).trim();
  const maxResults = Math.min(Math.max(data.maxResults, 1), 10);
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error("Missing TAVILY_API_KEY");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query, max_results: maxResults })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily error: ${response.status} ${text}`);
  }

  const json = (await response.json()) as TavilyResponse;
  const output = formatLookupResults(json.query ?? query, json.results ?? []);

  onEvent({ type: "node:output", nodeId: node.id, chunk: output });
  return { output };
}

async function executeAINode(
  node: WorkflowCanvasNode,
  context: string,
  onEvent: (event: ExecutionEvent) => void
): Promise<NodeExecutionResult> {
  const data = node.data as AINodeData;
  return { output: await requestAIText(data.prompt, context, node.id, onEvent) };
}

async function executeRouterNode(
  node: WorkflowCanvasNode,
  context: string
): Promise<NodeExecutionResult> {
  const data = node.data as RouterNodeData;
  const routerInstruction = `${data.prompt}

Respond with exactly one word: true or false. No punctuation, no explanation.`;
  const decision = await requestAIText(routerInstruction, context, node.id);
  const match = decision.toLowerCase().match(/\b(true|false)\b/);
  const normalizedDecision = match ? match[1] : "";

  if (normalizedDecision !== "true" && normalizedDecision !== "false") {
    throw new Error('Router node must respond with only "true" or "false".');
  }

  return { output: context, route: normalizedDecision };
}

export async function executeWorkflow(
  nodes: WorkflowCanvasNode[],
  edges: Edge[],
  onEvent: (event: ExecutionEvent) => void
): Promise<void> {
  const orderedNodes = topologicalSort(nodes, edges);
  const nodeMap = new Map(orderedNodes.map((node) => [node.id, node]));
  const outputsByNodeId = new Map<string, string>();
  const activeIncomingEdgesByNodeId = new Map<string, Edge[]>();
  const executedNodeIds = new Set<string>();

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

    if (activeIncomingEdges.some((edge) => !executedNodeIds.has(edge.source))) {
      continue;
    }

    const startedAt = Date.now();

    try {
      onEvent({ type: "node:start", nodeId: node.id });

      const parentContext = buildParentContext(node.id, activeIncomingEdges, outputsByNodeId);
      let result: NodeExecutionResult;

      if (node.type === "triggerNode") {
        await delay(400);
        result = { output: (node.data as TriggerNodeData).inputText?.trim() || "Workflow triggered." };
      } else if (node.type === "routerNode") {
        result = await executeRouterNode(node, parentContext);
      } else if (node.type === "actionNode") {
        await delay(300);
        result = { output: parentContext || "Output saved." };
      } else if (node.type === "aiNode") {
        result = await executeAINode(node, parentContext, onEvent);
      } else if (node.type === "lookupNode") {
        result = await executeLookupNode(node, parentContext, onEvent);
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
      } else {
        appendActiveEdges(edges.filter((edge) => edge.source === node.id));
      }

      onEvent({
        type: "node:complete",
        nodeId: node.id,
        output: result.output,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed.";
      onEvent({ type: "node:error", nodeId: node.id, error: message });
      throw error;
    }
  }

  onEvent({ type: "workflow:done" });
}
