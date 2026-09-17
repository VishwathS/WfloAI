import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import type { Edge, Node } from "reactflow";
import { validateWorkflow } from "@/lib/execution/validate";
import { EXECUTION_LIMITS, EXECUTE_ROUTE_MAX_DURATION_SECONDS } from "@/lib/execution/constants";
import { HTTP_LIMITS } from "@/lib/http/constants";
import type { WorkflowNodeData } from "@/lib/types";

type WorkflowNode = Node<WorkflowNodeData>;

const trigger: WorkflowNode = {
  id: "trigger",
  type: "triggerNode",
  position: { x: 0, y: 0 },
  data: { label: "Start", type: "Manual" } as WorkflowNodeData
};

// actionNode does no provider work, so this isolates the size cap from the
// AI-node cap that Task 03 added.
function action(id: string): WorkflowNode {
  return {
    id,
    type: "actionNode",
    position: { x: 0, y: 0 },
    data: { label: id, action: "Log Result" } as WorkflowNodeData
  };
}

function chain(actionCount: number): { nodes: WorkflowNode[]; edges: Edge[] } {
  const nodes = [trigger, ...Array.from({ length: actionCount }, (_, i) => action(`n-${i}`))];
  const edges: Edge[] = nodes.slice(1).map((node, i) => ({
    id: `e-${i}`,
    source: nodes[i].id,
    target: node.id
  }));
  return { nodes, edges };
}

describe("node-count cap", () => {
  test("allows a workflow exactly at the cap", () => {
    const { nodes, edges } = chain(EXECUTION_LIMITS.MAX_NODES_PER_RUN - 1);
    expect(nodes).toHaveLength(EXECUTION_LIMITS.MAX_NODES_PER_RUN);
    expect(validateWorkflow(nodes, edges).valid).toBe(true);
  });

  test("rejects one node over the cap with a clear error", () => {
    const { nodes, edges } = chain(EXECUTION_LIMITS.MAX_NODES_PER_RUN);
    const result = validateWorkflow(nodes, edges);

    expect(result.valid).toBe(false);
    expect(result.globalError).toContain(String(EXECUTION_LIMITS.MAX_NODES_PER_RUN));
  });

  test("makes no provider call while rejecting an oversized graph", async () => {
    // validateWorkflow is pure and runs before executeWorkflow in the execute
    // route, so rejection cannot reach Anthropic or Tavily. Assert the absence
    // of calls rather than only the error, per the task's verification note.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { nodes, edges } = chain(EXECUTION_LIMITS.MAX_NODES_PER_RUN + 20);

    const result = validateWorkflow(nodes, edges);

    expect(result.valid).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("counts only reachable nodes", () => {
    const { nodes, edges } = chain(EXECUTION_LIMITS.MAX_NODES_PER_RUN - 1);
    const orphans = Array.from({ length: 30 }, (_, i) => action(`orphan-${i}`));

    expect(validateWorkflow([...nodes, ...orphans], edges).valid).toBe(true);
  });
});

describe("runtime limit constants", () => {
  test("Lookup reuses the HTTP node's total timeout rather than a second convention", () => {
    expect(EXECUTION_LIMITS.LOOKUP_TIMEOUT_MS).toBe(HTTP_LIMITS.TOTAL_TIMEOUT_MS);
  });

  test("the AI timeout is longer than the Lookup timeout but inside the route budget", () => {
    expect(EXECUTION_LIMITS.AI_TIMEOUT_MS).toBeGreaterThan(EXECUTION_LIMITS.LOOKUP_TIMEOUT_MS);
    expect(EXECUTION_LIMITS.AI_TIMEOUT_MS).toBeLessThan(
      EXECUTE_ROUTE_MAX_DURATION_SECONDS * 1000
    );
  });

  test("the execute route budget matches the Inngest route's declared maxDuration", () => {
    expect(EXECUTE_ROUTE_MAX_DURATION_SECONDS).toBe(300);
  });
});

describe("segment config literals", () => {
  test("the execute route's maxDuration literal matches the documented constant", () => {
    const source = readFileSync(
      new URL("../app/api/workflows/[id]/execute/route.ts", import.meta.url),
      "utf8"
    );

    // Next 16 rejects a segment config export that is not statically
    // analyzable, so the route cannot import the constant. This keeps the
    // duplicated literal honest.
    expect(source).toContain(
      `export const maxDuration = ${EXECUTE_ROUTE_MAX_DURATION_SECONDS};`
    );
  });
});
