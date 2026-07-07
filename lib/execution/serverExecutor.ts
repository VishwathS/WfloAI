import Anthropic from "@anthropic-ai/sdk";
import type { Edge, Node } from "reactflow";
import type {
  ActionNodeData,
  AIActionType,
  AINodeData,
  FileInputNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  TriggerNodeData
} from "@/lib/types";
import type { ExecutionEvent, NodeExecutionResult } from "@/lib/execution/types";
import { topologicalSort } from "@/lib/execution/topologicalSort";

type WorkflowCanvasNode = Node<
  | TriggerNodeData
  | AINodeData
  | RouterNodeData
  | ActionNodeData
  | LookupNodeData
  | InputNodeData
  | FileInputNodeData
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

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function getActionSchema(action: AIActionType, outputFields?: string[]): string {
  switch (action) {
    case "Summarize":
      return `{"summary": "string", "keyPoints": ["string"]}`;
    case "Rewrite":
      return `{"rewrittenContent": "string"}`;
    case "Classify":
      return `{"category": "string", "confidence": 0.95, "reasoning": "string"}`;
    case "Extract": {
      const fields = outputFields?.length ? outputFields : ["value"];
      return JSON.stringify(Object.fromEntries(fields.map((f) => [f, "string"])));
    }
    case "Generate":
      return `{"content": "string"}`;
  }
}

function collectNamedInputs(
  nodes: WorkflowCanvasNode[],
  edges: Edge[]
): Record<string, string> {
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
  for (const id of queue) reachable.add(id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const targetId of adjacency.get(id) ?? []) {
      if (!reachable.has(targetId)) {
        reachable.add(targetId);
        queue.push(targetId);
      }
    }
  }

  const inputs: Record<string, string> = {};
  for (const node of nodes) {
    if (node.type === "inputNode" && reachable.has(node.id)) {
      const data = node.data as InputNodeData;
      if (data.key) inputs[data.key] = data.defaultValue ?? "";
    }
  }
  return inputs;
}

function interpolateTemplate(template: string, inputs: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in inputs)) {
      throw new Error(
        `Prompt references undefined input "{{${key}}}" — add an Input node with key "${key}".`
      );
    }
    return inputs[key];
  });
}

function buildParentContext(
  nodeId: string,
  edges: Edge[],
  outputsByNodeId: Map<string, string>
) {
  const parentOutputs = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => {
      const raw = outputsByNodeId.get(edge.source)?.trim();
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object") {
          return `Structured output:\n${JSON.stringify(parsed, null, 2)}`;
        }
      } catch {
        // not JSON, pass through as-is
      }
      return raw;
    })
    .filter((output): output is string => Boolean(output));

  return parentOutputs.join("\n\n");
}

function buildPrompt(prompt: string, context: string, schema?: string) {
  const base = `Context from previous step:\n${context}\n\nInstruction:\n${prompt}`;
  if (!schema) return base;
  return `${base}\n\nYou MUST respond with ONLY a valid JSON object matching this exact shape:\n${schema}\nNo markdown, no code blocks, no explanation — just the raw JSON object.`;
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
  onEvent?: (event: ExecutionEvent) => void,
  schema?: string
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: buildPrompt(prompt, context, schema) }]
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

  if (schema) {
    output = extractJson(output);
    try {
      JSON.parse(output);
    } catch {
      throw new Error(`AI node did not return valid JSON. Output: ${output.slice(0, 120)}`);
    }
  }

  return output;
}

async function executeLookupNode(
  node: WorkflowCanvasNode,
  context: string,
  onEvent: (event: ExecutionEvent) => void,
  namedInputs: Record<string, string>
): Promise<NodeExecutionResult> {
  const data = node.data as LookupNodeData;
  const query = interpolateTemplate(data.query, { ...namedInputs, input: context }).trim();
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
  onEvent: (event: ExecutionEvent) => void,
  namedInputs: Record<string, string>
): Promise<NodeExecutionResult> {
  const data = node.data as AINodeData;
  const action = data.action;
  const outputMode = data.outputMode ?? (action ? "json" : "text");
  const schema = outputMode === "json" && action
    ? getActionSchema(action, data.outputFields)
    : undefined;
  const prompt = interpolateTemplate(data.prompt, namedInputs);
  return { output: await requestAIText(prompt, context, node.id, onEvent, schema) };
}

async function executeRouterNode(
  node: WorkflowCanvasNode,
  context: string,
  namedInputs: Record<string, string>
): Promise<NodeExecutionResult> {
  const data = node.data as RouterNodeData;

  if (data.conditionField && typeof data.conditionValue === "string") {
    try {
      const parsed = JSON.parse(context) as Record<string, unknown>;
      if (parsed[data.conditionField] !== undefined) {
        const matched = String(parsed[data.conditionField]) === data.conditionValue;
        return { output: context, route: matched ? "true" : "false" };
      }
    } catch {
      // context is not JSON — fall through to AI routing
    }
  }

  const prompt = interpolateTemplate(data.prompt, namedInputs);
  const routerInstruction = `${prompt}

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
  const namedInputs = collectNamedInputs(orderedNodes, edges);
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
    const isEntryNode =
      node.type === "triggerNode" || node.type === "inputNode" || node.type === "fileInputNode";
    const activeIncomingEdges =
      isEntryNode ? [] : activeIncomingEdgesByNodeId.get(node.id) ?? [];

    if (!isEntryNode && activeIncomingEdges.length === 0) {
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
      } else if (node.type === "inputNode") {
        await delay(200);
        result = { output: (node.data as InputNodeData).defaultValue ?? "" };
      } else if (node.type === "fileInputNode") {
        const data = node.data as FileInputNodeData;
        if (!data.fileId) {
          throw new Error(`"${data.label || "File Input"}" needs an uploaded file.`);
        }
        if (data.resolvedText === undefined) {
          throw new Error(
            `"${data.label || "File Input"}" — the uploaded file no longer exists. Re-upload it.`
          );
        }
        await delay(200);
        result = { output: data.resolvedText };
      } else if (node.type === "routerNode") {
        result = await executeRouterNode(node, parentContext, namedInputs);
      } else if (node.type === "actionNode") {
        await delay(300);
        result = { output: parentContext || "Output saved." };
      } else if (node.type === "aiNode") {
        result = await executeAINode(node, parentContext, onEvent, namedInputs);
      } else if (node.type === "lookupNode") {
        result = await executeLookupNode(node, parentContext, onEvent, namedInputs);
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
