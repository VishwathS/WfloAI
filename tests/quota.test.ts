import { describe, expect, test } from "vitest";
import type { Edge, Node } from "reactflow";
import { validateWorkflow } from "@/lib/execution/validate";
import { INTEGRATION_LIMITS, AI_QUOTA, LOOKUP_QUOTA } from "@/lib/integrations/limits";
import { quotaMessage } from "@/lib/integrations/quota";
import {
  AVG_TOKENS,
  PROVIDER_PRICES,
  costUsd,
  estimateFromCallCounts,
  worstCaseDailyCostUsd
} from "@/lib/integrations/pricing";
import type { WorkflowNodeData } from "@/lib/types";

type WorkflowNode = Node<WorkflowNodeData>;

const trigger: WorkflowNode = {
  id: "trigger",
  type: "triggerNode",
  position: { x: 0, y: 0 },
  data: { label: "Start", type: "Manual" } as WorkflowNodeData
};

function ai(id: string): WorkflowNode {
  return {
    id,
    type: "aiNode",
    position: { x: 0, y: 0 },
    data: { label: id, action: "Generate", prompt: "write something" } as WorkflowNodeData
  };
}

// A chain so every node is reachable from the trigger — unreachable nodes are
// filtered out before the cap is applied, which is the behaviour being pinned.
function chain(count: number): { nodes: WorkflowNode[]; edges: Edge[] } {
  const nodes = [trigger, ...Array.from({ length: count }, (_, i) => ai(`ai-${i}`))];
  const edges: Edge[] = nodes.slice(1).map((node, i) => ({
    id: `e-${i}`,
    source: nodes[i].id,
    target: node.id
  }));
  return { nodes, edges };
}

describe("per-run AI-node cap", () => {
  test("allows a workflow exactly at the cap", () => {
    const { nodes, edges } = chain(INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN);
    expect(validateWorkflow(nodes, edges).valid).toBe(true);
  });

  test("rejects a workflow one node over the cap, before execution starts", () => {
    const { nodes, edges } = chain(INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN + 1);
    const result = validateWorkflow(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.globalError).toContain(String(INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN));
    // A global error, not a per-node one: the graph as a whole is the problem.
    expect(result.nodeErrors).toEqual({});
  });

  test("counts Router nodes, which are AI calls too", () => {
    const { nodes, edges } = chain(INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN);
    const router: WorkflowNode = {
      id: "router",
      type: "routerNode",
      position: { x: 0, y: 0 },
      data: { label: "router", prompt: "is it true?" } as WorkflowNodeData
    };
    const last = nodes[nodes.length - 1];

    const result = validateWorkflow(
      [...nodes, router],
      [...edges, { id: "e-router", source: last.id, target: router.id }]
    );

    expect(result.valid).toBe(false);
    expect(result.globalError).toContain("AI and Router nodes");
  });

  test("ignores unreachable AI nodes", () => {
    const { nodes, edges } = chain(INTEGRATION_LIMITS.MAX_AI_NODES_PER_RUN);
    const orphans = Array.from({ length: 10 }, (_, i) => ai(`orphan-${i}`));

    expect(validateWorkflow([...nodes, ...orphans], edges).valid).toBe(true);
  });
});

describe("quotaMessage", () => {
  test("distinguishes the minute window from the day window", () => {
    expect(quotaMessage({ allowed: false, reason: "per_minute" }, "AI")).toContain("in a minute");
    expect(quotaMessage({ allowed: false, reason: "per_day" }, "AI")).toContain("tomorrow");
  });

  test("names the resource so the two endpoints are distinguishable", () => {
    expect(quotaMessage({ allowed: false, reason: "per_minute" }, "search")).toContain("search");
  });
});

describe("unit-cost method", () => {
  test("prices tokens per million and searches per call", () => {
    const cost = costUsd({ aiInputTokens: 1_000_000, aiOutputTokens: 0, lookupSearches: 0 });
    expect(cost).toBeCloseTo(PROVIDER_PRICES.aiInputPerMTok, 10);

    const searches = costUsd({ aiInputTokens: 0, aiOutputTokens: 0, lookupSearches: 10 });
    expect(searches).toBeCloseTo(PROVIDER_PRICES.lookupPerSearch * 10, 10);
  });

  test("output tokens cost more than input tokens", () => {
    const input = costUsd({ aiInputTokens: 1000, aiOutputTokens: 0, lookupSearches: 0 });
    const output = costUsd({ aiInputTokens: 0, aiOutputTokens: 1000, lookupSearches: 0 });
    expect(output).toBeGreaterThan(input);
  });

  test("a zero-usage period costs nothing", () => {
    expect(costUsd({ aiInputTokens: 0, aiOutputTokens: 0, lookupSearches: 0 })).toBe(0);
  });

  test("call-count estimate agrees with the token calculation it stands in for", () => {
    const viaCalls = estimateFromCallCounts({ aiCalls: 100, lookupSearches: 5 });
    const viaTokens = costUsd({
      aiInputTokens: 100 * AVG_TOKENS.inputPerCall,
      aiOutputTokens: 100 * AVG_TOKENS.outputPerCall,
      lookupSearches: 5
    });
    expect(viaCalls).toBeCloseTo(viaTokens, 10);
  });

  test("worst case is bounded by the day quotas and exceeds ordinary use", () => {
    const worstCase = worstCaseDailyCostUsd(INTEGRATION_LIMITS);
    const ordinaryDay = estimateFromCallCounts({ aiCalls: 10, lookupSearches: 2 });

    expect(worstCase).toBeGreaterThan(ordinaryDay);
    // The point of the cap: a finite number, not infinity.
    expect(Number.isFinite(worstCase)).toBe(true);
    expect(worstCase).toBeGreaterThan(0);
  });

  test("quota windows are internally consistent", () => {
    expect(AI_QUOTA.perDay).toBeGreaterThan(AI_QUOTA.perMinute);
    expect(LOOKUP_QUOTA.perDay).toBeGreaterThan(LOOKUP_QUOTA.perMinute);
  });
});
