import { describe, expect, it } from "vitest";
import type { Edge, Node } from "reactflow";
import { validateWorkflow } from "@/lib/execution/validate";
import type { GmailNodeData, HttpRequestNodeData, WorkflowNodeData } from "@/lib/types";

type WorkflowNode = Node<WorkflowNodeData>;

const trigger: WorkflowNode = {
  id: "trigger",
  type: "triggerNode",
  position: { x: 0, y: 0 },
  data: { label: "Start", type: "Manual" } as WorkflowNodeData
};

function gmail(id: string, data: Partial<GmailNodeData>): WorkflowNode {
  return {
    id,
    type: "gmailNode",
    position: { x: 0, y: 0 },
    data: { label: id, action: "Send Email", ...data } as GmailNodeData
  };
}

function http(id: string, data: Partial<HttpRequestNodeData>): WorkflowNode {
  return {
    id,
    type: "httpRequestNode",
    position: { x: 0, y: 0 },
    data: {
      label: id,
      method: "GET",
      url: "https://api.example.com",
      queryParams: [],
      headers: [],
      authType: "none",
      ...data
    } as HttpRequestNodeData
  };
}

function edge(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target };
}

describe("validateWorkflow — Gmail rules", () => {
  it("rejects Reply to Email with no Read Email parent", () => {
    const nodes = [trigger, gmail("reply", { action: "Reply to Email", body: "Thanks!" })];
    const result = validateWorkflow(nodes, [edge("trigger", "reply")]);

    expect(result.valid).toBe(false);
    expect(result.nodeErrors.reply).toContain("Read Email node connected directly before it");
  });

  it("reports the missing Read parent even when the body is also empty", () => {
    // Regression: the structural error used to be masked by the body check, so
    // fixing the body surfaced a second, different error on the next run.
    const nodes = [trigger, gmail("reply", { action: "Reply to Email", body: "" })];
    const result = validateWorkflow(nodes, [edge("trigger", "reply")]);

    expect(result.nodeErrors.reply).toContain("Read Email node connected directly before it");
    expect(result.nodeErrors.reply).not.toContain("message body");
  });

  it("still requires a body once the Read parent is present", () => {
    const nodes = [
      trigger,
      gmail("find", { action: "Find Emails", query: "is:unread" }),
      gmail("read", { action: "Read Email" }),
      gmail("reply", { action: "Reply to Email", body: "" })
    ];
    const result = validateWorkflow(nodes, [
      edge("trigger", "find"),
      edge("find", "read"),
      edge("read", "reply")
    ]);

    expect(result.nodeErrors.reply).toContain("message body");
  });

  it("accepts the canonical Find → Read → Reply chain", () => {
    const nodes = [
      trigger,
      gmail("find", { action: "Find Emails", query: "is:unread" }),
      gmail("read", { action: "Read Email" }),
      gmail("reply", { action: "Reply to Email", body: "Thanks for reaching out." })
    ];
    const result = validateWorkflow(nodes, [
      edge("trigger", "find"),
      edge("find", "read"),
      edge("read", "reply")
    ]);

    expect(result.valid).toBe(true);
    expect(result.nodeErrors).toEqual({});
  });

  it("rejects Read Email fed by a Gmail node that emits no email metadata", () => {
    // Send Email produces no messageId/threadId, so this fails at run time in
    // findUpstreamEmailRef. Validation must catch it first.
    const nodes = [
      trigger,
      gmail("send", { action: "Send Email", to: "a@example.com", body: "hi" }),
      gmail("read", { action: "Read Email" })
    ];
    const result = validateWorkflow(nodes, [edge("trigger", "send"), edge("send", "read")]);

    expect(result.valid).toBe(false);
    expect(result.nodeErrors.read).toContain("Find Emails");
  });

  it("rejects more than one Gmail parent on Read Email", () => {
    const nodes = [
      trigger,
      gmail("findA", { action: "Find Emails", query: "is:unread" }),
      gmail("findB", { action: "Find Emails", query: "from:billing" }),
      gmail("read", { action: "Read Email" })
    ];
    const result = validateWorkflow(nodes, [
      edge("trigger", "findA"),
      edge("trigger", "findB"),
      edge("findA", "read"),
      edge("findB", "read")
    ]);

    expect(result.valid).toBe(false);
    expect(result.nodeErrors.read).toContain("exactly one Gmail node");
  });

  it("requires a search query on Find Emails", () => {
    const nodes = [trigger, gmail("find", { action: "Find Emails", query: "" })];
    const result = validateWorkflow(nodes, [edge("trigger", "find")]);

    expect(result.nodeErrors.find).toContain("search query");
  });

  it("requires a recipient on Send Email", () => {
    const nodes = [trigger, gmail("send", { action: "Send Email", to: "", body: "hi" })];
    const result = validateWorkflow(nodes, [edge("trigger", "send")]);

    expect(result.nodeErrors.send).toContain("recipient");
  });
});

describe("validateWorkflow — HTTP Request rules", () => {
  it("requires a URL", () => {
    const nodes = [trigger, http("req", { url: "" })];
    const result = validateWorkflow(nodes, [edge("trigger", "req")]);

    expect(result.nodeErrors.req).toContain("needs a URL");
  });

  it("rejects a blocked header set manually", () => {
    const nodes = [trigger, http("req", { headers: [{ key: "Host", value: "evil.example" }] })];
    const result = validateWorkflow(nodes, [edge("trigger", "req")]);

    expect(result.valid).toBe(false);
    expect(result.nodeErrors.req).toContain("can't be set manually");
  });

  it("requires a credential when auth is not None", () => {
    const nodes = [trigger, http("req", { authType: "bearer", credentialId: undefined })];
    const result = validateWorkflow(nodes, [edge("trigger", "req")]);

    expect(result.nodeErrors.req).toContain("needs a credential");
  });

  it("accepts a plain GET with no auth", () => {
    const nodes = [trigger, http("req", {})];
    const result = validateWorkflow(nodes, [edge("trigger", "req")]);

    expect(result.valid).toBe(true);
  });
});
