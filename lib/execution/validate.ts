import type { Edge, Node } from "reactflow";
import type {
  AINodeData,
  FileInputNodeData,
  GmailNodeData,
  HttpRequestNodeData,
  InputNodeData,
  LookupNodeData,
  RouterNodeData,
  WorkflowNodeData
} from "@/lib/types";
import { topologicalSort } from "@/lib/execution/topologicalSort";
import { HTTP_LIMITS, isBlockedHeader } from "@/lib/http/constants";

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

    if (node.type === "gmailNode") {
      const data = node.data as GmailNodeData;
      const label = data.label || "Gmail";

      // Mirrors findUpstreamEmailRef in lib/gmail/infer.ts: only Gmail nodes
      // that emit email metadata (Find Emails, Read Email) can source a
      // Read/Reply, and exactly one Gmail node may be connected.
      const gmailParents = reachableEdges
        .filter((edge) => edge.target === node.id)
        .map((edge) => reachableNodes.find((n) => n.id === edge.source))
        .filter((parent): parent is WorkflowNode => parent?.type === "gmailNode");
      const emailSourceParents = gmailParents.filter((parent) => {
        const parentAction = (parent.data as GmailNodeData).action;
        return parentAction === "Find Emails" || parentAction === "Read Email";
      });

      if (data.action === "Send Email") {
        if (!data.to?.trim()) {
          nodeErrors[node.id] = `"${label}" needs a recipient before it can run.`;
        } else if (!data.body?.trim()) {
          nodeErrors[node.id] = `"${label}" needs a message body before it can run.`;
        }
      } else if (data.action === "Create Draft") {
        if (!data.to?.trim()) {
          nodeErrors[node.id] = `"${label}" needs a recipient before it can run.`;
        }
      } else if (data.action === "Reply to Email") {
        const hasReadParent = emailSourceParents.some(
          (parent) => (parent.data as GmailNodeData).action === "Read Email"
        );
        if (!hasReadParent) {
          nodeErrors[node.id] =
            `"${label}" needs a Read Email node connected directly before it.`;
        } else if (gmailParents.length > 1) {
          nodeErrors[node.id] =
            `"${label}" — connect exactly one Gmail node before this step (found ${gmailParents.length}).`;
        } else if (!data.body?.trim()) {
          nodeErrors[node.id] = `"${label}" needs a message body before it can run.`;
        }
      } else if (data.action === "Find Emails") {
        if (!data.query?.trim()) {
          nodeErrors[node.id] = `"${label}" needs a search query before it can run.`;
        }
      } else if (data.action === "Read Email") {
        if (emailSourceParents.length === 0) {
          nodeErrors[node.id] =
            `"${label}" needs a Gmail Find Emails node connected before it.`;
        } else if (gmailParents.length > 1) {
          nodeErrors[node.id] =
            `"${label}" — connect exactly one Gmail node before this step (found ${gmailParents.length}).`;
        }
      }
    }

    if (node.type === "httpRequestNode") {
      const data = node.data as HttpRequestNodeData;
      const label = data.label || "HTTP Request";
      const blockedHeader = (data.headers ?? []).find(
        (header) => header.key.trim() && isBlockedHeader(header.key.trim())
      );

      if (!data.url?.trim()) {
        nodeErrors[node.id] = `"${label}" needs a URL before it can run.`;
      } else if (data.url.length > HTTP_LIMITS.MAX_URL_LENGTH) {
        nodeErrors[node.id] = `"${label}" — the URL is too long.`;
      } else if ((data.headers ?? []).filter((h) => h.key.trim()).length > HTTP_LIMITS.MAX_HEADERS) {
        nodeErrors[node.id] = `"${label}" has too many headers (max ${HTTP_LIMITS.MAX_HEADERS}).`;
      } else if (blockedHeader) {
        nodeErrors[node.id] = `"${label}" — the "${blockedHeader.key.trim()}" header can't be set manually.`;
      } else if (data.authType !== "none" && !data.credentialId) {
        nodeErrors[node.id] = `"${label}" needs a credential for its authentication, or set Auth to None.`;
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
    if (nodeErrors[node.id]) {
      continue;
    }

    let templates: string[] = [];
    if (node.type === "aiNode" || node.type === "routerNode") {
      templates = [(node.data as AINodeData | RouterNodeData).prompt ?? ""];
    } else if (node.type === "gmailNode") {
      const data = node.data as GmailNodeData;
      templates = [data.to, data.subject, data.body, data.replyTo, data.query].filter(
        (value): value is string => Boolean(value)
      );
    } else if (node.type === "httpRequestNode") {
      const data = node.data as HttpRequestNodeData;
      templates = [
        data.url,
        data.body,
        ...(data.queryParams ?? []).flatMap((param) => [param.key, param.value]),
        ...(data.headers ?? []).flatMap((header) => [header.key, header.value])
      ].filter((value): value is string => Boolean(value));
    } else {
      continue;
    }

    const missing = templates
      .flatMap((template) => [...template.matchAll(/\{\{(\w+)\}\}/g)])
      .map((m) => m[1])
      .filter((key) => key !== "previousOutput" && !availableKeys.has(key));
    if (missing.length > 0) {
      const label = (node.data as { label?: string }).label || "Node";
      if (missing.includes("input")) {
        nodeErrors[node.id] =
          `"${label}" uses {{input}}, which is deprecated — use {{previousOutput}} for the upstream node's output.`;
      } else {
        const available = [...availableKeys, "previousOutput"].map((k) => `{{${k}}}`).join(", ");
        const uniqueMissing = [...new Set(missing)];
        nodeErrors[node.id] =
          `"${label}" references undefined input(s): ${uniqueMissing.map((k) => `{{${k}}}`).join(", ")}. Available: ${available}.`;
      }
    }
  }

  return { valid: Object.keys(nodeErrors).length === 0, nodeErrors };
}
