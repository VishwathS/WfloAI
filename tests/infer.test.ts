import { describe, expect, test } from "vitest";
import { findUpstreamEmailRef } from "@/lib/gmail/infer";

const readParent = {
  nodeId: "read-1",
  metadata: { gmail: { messageId: "m1", threadId: "t1" } }
};

const findParent = (emails: Array<{ messageId: string; threadId: string }>) => ({
  nodeId: "find-1",
  metadata: { gmail: { emails } }
});

const plainParent = { nodeId: "ai-1", metadata: undefined };

describe("findUpstreamEmailRef", () => {
  test("uses a Read parent's message directly", () => {
    expect(findUpstreamEmailRef([readParent, plainParent], "Reply to Email")).toEqual({
      messageId: "m1",
      threadId: "t1"
    });
  });

  test("Read Email takes the first (most recent) Find result", () => {
    const parent = findParent([
      { messageId: "m1", threadId: "t1" },
      { messageId: "m2", threadId: "t2" }
    ]);
    expect(findUpstreamEmailRef([parent], "Read Email")).toEqual({
      messageId: "m1",
      threadId: "t1"
    });
  });

  test("Reply refuses a Find parent — never guesses among multiple results", () => {
    const parent = findParent([{ messageId: "m1", threadId: "t1" }]);
    expect(() => findUpstreamEmailRef([parent], "Reply to Email")).toThrow(
      "Read Email node directly before it"
    );
  });

  test("errors when Find matched nothing", () => {
    expect(() => findUpstreamEmailRef([findParent([])], "Read Email")).toThrow(
      "No emails matched"
    );
  });

  test("errors when no Gmail parent exists", () => {
    expect(() => findUpstreamEmailRef([plainParent], "Read Email")).toThrow(
      "needs a Gmail Find Emails"
    );
  });

  test("errors on multiple Gmail parents — ambiguity fails before external actions", () => {
    const another = { nodeId: "read-2", metadata: { gmail: { messageId: "m9", threadId: "t9" } } };
    expect(() => findUpstreamEmailRef([readParent, another], "Read Email")).toThrow(
      "exactly one Gmail node"
    );
  });
});
