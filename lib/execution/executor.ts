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

function stripStructuredPrefix(raw: string): string {
  return raw.replace(/^Structured output:\n/m, "");
}

function referencesPreviousOutput(template: string): boolean {
  return /\{\{previousOutput\}\}/.test(template);
}

async function requestAIText(
  prompt: string,
  context: string,
  nodeId: string,
  onEvent?: (event: ExecutionEvent) => void,
  schema?: string
) {
  let response: Response;

  try {
    response = await fetch("/api/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt, context, schema })
    });
  } catch {
    throw new Error("Cannot reach /api/execute — ensure the dev server is running.");
  }

  if (!response.ok || !response.body) {
    throw new Error(`AI request failed (HTTP ${response.status}).`);
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
  onEvent: (event: ExecutionEvent) => void | Promise<void>,
  namedInputs: Record<string, string>
): Promise<NodeExecutionResult> {
  const data = node.data as LookupNodeData;
  const query = interpolateTemplate(data.query, {
    ...namedInputs,
    previousOutput: context,
    input: context
  }).trim();

  let response: Response;

  try {
    response = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxResults: data.maxResults })
    });
  } catch {
    throw new Error("Cannot reach /api/lookup — ensure the dev server is running.");
  }

  if (!response.ok) {
    const json = (await response.json()) as { error?: string };
    throw new Error(json.error ?? `Lookup request failed (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as { output: string };
  const output = json.output ?? "";

  onEvent({ type: "node:output", nodeId: node.id, chunk: output });
  return { output };
}

async function executeAINode(
  node: WorkflowCanvasNode,
  context: string,
  onEvent: (event: ExecutionEvent) => void | Promise<void>,
  namedInputs: Record<string, string>
): Promise<NodeExecutionResult> {
  const data = node.data as AINodeData;
  const action = data.action;
  const outputMode = data.outputMode ?? (action ? "json" : "text");
  const schema = outputMode === "json" && action
    ? getActionSchema(action, data.outputFields)
    : undefined;
  const prompt = interpolateTemplate(data.prompt, { ...namedInputs, previousOutput: context });
  const effectiveContext = referencesPreviousOutput(data.prompt) ? "" : context;
  return { output: await requestAIText(prompt, effectiveContext, node.id, onEvent, schema) };
}

async function executeRouterNode(
  node: WorkflowCanvasNode,
  context: string,
  namedInputs: Record<string, string>
): Promise<NodeExecutionResult> {
  const data = node.data as RouterNodeData;

  if (data.conditionField && typeof data.conditionValue === "string") {
    try {
      const parsed = JSON.parse(stripStructuredPrefix(context)) as Record<string, unknown>;
      if (parsed[data.conditionField] !== undefined) {
        const matched = String(parsed[data.conditionField]) === data.conditionValue;
        return { output: stripStructuredPrefix(context), route: matched ? "true" : "false" };
      }
    } catch {
      // context is not JSON — fall through to AI routing
    }
  }

  const prompt = interpolateTemplate(data.prompt, { ...namedInputs, previousOutput: context });
  const routerInstruction = `${prompt}

Respond with exactly one word: true or false. No punctuation, no explanation.`;
  const effectiveContext = referencesPreviousOutput(data.prompt) ? "" : context;
  const decision = await requestAIText(routerInstruction, effectiveContext, node.id);
  const match = decision.toLowerCase().match(/\b(true|false)\b/);
  const normalizedDecision = match ? match[1] : "";

  if (normalizedDecision !== "true" && normalizedDecision !== "false") {
    throw new Error('Router node must respond with only "true" or "false".');
  }

  return { output: stripStructuredPrefix(context), route: normalizedDecision };
}

export async function executeWorkflow(
  nodes: WorkflowCanvasNode[],
  edges: Edge[],
  onEvent: (event: ExecutionEvent) => void | Promise<void>
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
        result = { output: stripStructuredPrefix(parentContext) || "Output saved." };
      } else if (node.type === "aiNode") {
        result = await executeAINode(node, parentContext, onEvent, namedInputs);
      } else if (node.type === "lookupNode") {
        result = await executeLookupNode(node, parentContext, onEvent, namedInputs);
      } else if (node.type === "gmailNode" || node.type === "httpRequestNode") {
        // Integration nodes are server-execution-only: credentials, Gmail ids,
        // and idempotency all live server-side. The primary run path
        // (POST /api/workflows/[id]/execute) handles them.
        throw new Error("This node runs on the server — use the workflow Run button.");
      } else {
        throw new Error(`Unsupported node type: ${node.type}`);
      }

      if (node.type === "routerNode") {
        const branchEdges = edges.filter(
          (edge) => edge.source === node.id && edge.sourceHandle === result.route
        );
        if (branchEdges.length === 0) {
          result.output += `\n\n⚠️ Routed to "${result.route}", but nothing is connected to the ${result.route} branch — the workflow stopped here.`;
        }
        appendActiveEdges(branchEdges);
      } else {
        appendActiveEdges(edges.filter((edge) => edge.source === node.id));
      }

      outputsByNodeId.set(node.id, result.output);
      executedNodeIds.add(node.id);

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

  await onEvent({
    type: "workflow:done"
  });
}
