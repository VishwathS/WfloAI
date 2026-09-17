import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import type { GmailActionType } from "@/lib/types";
import { containsSendCapableGmailNode } from "@/lib/execution/validate";
import { requiresUnattendedSendConsent } from "@/lib/schedule/consent";
import { executeGmailAction } from "@/lib/gmail/actions";
import { gmailReadActionsEnabled, isRestrictedAction } from "@/lib/gmail/scopes";
import type { IntegrationContext } from "@/lib/integrations/types";

const ALL_ACTIONS: GmailActionType[] = [
  "Send Email",
  "Create Draft",
  "Reply to Email",
  "Find Emails",
  "Read Email"
];

function gmailNode(action: GmailActionType) {
  return { type: "gmailNode", data: { label: "Gmail", action } };
}

describe("send-capability detection", () => {
  test("Send Email and Reply to Email both put mail in an inbox", () => {
    expect(containsSendCapableGmailNode([gmailNode("Send Email")])).toBe(true);
    expect(containsSendCapableGmailNode([gmailNode("Reply to Email")])).toBe(true);
  });

  test("Create Draft, Find and Read do not send", () => {
    expect(containsSendCapableGmailNode([gmailNode("Create Draft")])).toBe(false);
    expect(containsSendCapableGmailNode([gmailNode("Find Emails")])).toBe(false);
    expect(containsSendCapableGmailNode([gmailNode("Read Email")])).toBe(false);
  });

  test("a graph with no Gmail node is not send-capable", () => {
    expect(
      containsSendCapableGmailNode([
        { type: "triggerNode", data: { label: "Start" } },
        { type: "aiNode", data: { label: "Summarize" } }
      ])
    ).toBe(false);
  });

  test("malformed graph JSONB does not throw", () => {
    // The graph column is user-writable, so the detector is fed untrusted shapes.
    expect(containsSendCapableGmailNode([{ type: "gmailNode" }])).toBe(false);
    expect(containsSendCapableGmailNode([])).toBe(false);
  });
});

describe("when unattended-send consent is required", () => {
  test("enabling a schedule on a send-capable graph needs it", () => {
    expect(requiresUnattendedSendConsent(true, [gmailNode("Send Email")])).toBe(true);
  });

  test("a graph that cannot send needs none — friction only on the irreversible action", () => {
    expect(requiresUnattendedSendConsent(true, [gmailNode("Find Emails")])).toBe(false);
    expect(
      requiresUnattendedSendConsent(true, [{ type: "aiNode", data: { label: "Summarize" } }])
    ).toBe(false);
  });

  test("a schedule left disabled needs none — nothing runs unattended yet", () => {
    expect(requiresUnattendedSendConsent(false, [gmailNode("Send Email")])).toBe(false);
  });
});

describe("the consent gate is wired into both schedule routes", () => {
  const create = readFileSync(
    new URL("../app/api/workflows/[id]/schedules/route.ts", import.meta.url),
    "utf8"
  );
  const update = readFileSync(
    new URL("../app/api/workflows/[id]/schedules/[scheduleId]/route.ts", import.meta.url),
    "utf8"
  );

  test("creating an enabled schedule is gated", () => {
    expect(create).toContain("requiresUnattendedSendConsent(body.enabled, graph.nodes)");
    expect(create).toContain("body.unattended_send_ack !== true");
  });

  test("enabling an existing schedule is gated on the transition only", () => {
    expect(update).toContain("body.enabled === true && !result.schedule.enabled");
    expect(update).toContain("body.unattended_send_ack !== true");
  });

  test("the authorization is written to the audit log from both paths", () => {
    expect(create).toContain('"gmail.unattended_send.authorized"');
    expect(update).toContain('"gmail.unattended_send.authorized"');
  });
});

describe("D1 — restricted Gmail actions stay off", () => {
  const originalFlag = process.env.GMAIL_READ_ACTIONS_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.GMAIL_READ_ACTIONS_ENABLED;
    } else {
      process.env.GMAIL_READ_ACTIONS_ENABLED = originalFlag;
    }
  });

  test("the flag defaults off, so an unconfigured deploy exposes nothing", () => {
    delete process.env.GMAIL_READ_ACTIONS_ENABLED;
    expect(gmailReadActionsEnabled()).toBe(false);

    process.env.GMAIL_READ_ACTIONS_ENABLED = "TRUE";
    expect(gmailReadActionsEnabled()).toBe(false);
  });

  test("Send is the only unrestricted action — Create Draft is restricted (A15)", () => {
    expect(isRestrictedAction("Send Email")).toBe(false);
    for (const action of ALL_ACTIONS.filter((a) => a !== "Send Email")) {
      expect(isRestrictedAction(action)).toBe(true);
    }
  });

  test.each(ALL_ACTIONS.filter((a) => a !== "Send Email"))(
    "%s is refused by the executor even from a crafted graph",
    async (action) => {
      // The graph column is user-writable, so the dropdown is not a control.
      // The guard is the first statement in executeGmailAction, which is why a
      // deliberately empty context never gets touched.
      delete process.env.GMAIL_READ_ACTIONS_ENABLED;

      await expect(
        executeGmailAction(
          {} as IntegrationContext,
          "node-1",
          { action } as Parameters<typeof executeGmailAction>[2],
          []
        )
      ).rejects.toThrow(/not available in this version/);
    }
  );

  test("the node dropdown hides exactly the actions the server refuses", () => {
    // Both halves, as the task requires: a UI-only check would miss a crafted
    // graph, and a server-only check would leave an action visible that always
    // fails. GmailNode.tsx mirrors the predicate because scopes.ts is
    // server-only; this is what stops the mirror drifting.
    const source = readFileSync(
      new URL("../components/canvas/nodes/GmailNode.tsx", import.meta.url),
      "utf8"
    );
    const block = source.split("const RESTRICTED_ACTIONS = new Set<GmailActionType>([")[1];
    const listed = new Set(
      (block?.split("]);")[0] ?? "").match(/"[^"]+"/g)?.map((quoted) => quoted.slice(1, -1)) ?? []
    );

    for (const action of ALL_ACTIONS) {
      expect(listed.has(action)).toBe(isRestrictedAction(action));
    }
  });
});
