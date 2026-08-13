import { describe, expect, test } from "vitest";
import { buildIdempotencyKey, deriveRunId } from "@/lib/integrations/idempotency";

describe("buildIdempotencyKey", () => {
  test("is stable for the same run and node", () => {
    expect(buildIdempotencyKey("run-1", "node-a")).toBe("run-1:node-a");
    expect(buildIdempotencyKey("run-1", "node-a")).toBe(buildIdempotencyKey("run-1", "node-a"));
  });

  test("differs across runs and nodes", () => {
    expect(buildIdempotencyKey("run-1", "node-a")).not.toBe(buildIdempotencyKey("run-2", "node-a"));
    expect(buildIdempotencyKey("run-1", "node-a")).not.toBe(buildIdempotencyKey("run-1", "node-b"));
  });
});

describe("deriveRunId", () => {
  test("is deterministic — Inngest retries reuse the same runId", () => {
    expect(deriveRunId("01J0EVENTID")).toBe(deriveRunId("01J0EVENTID"));
  });

  test("differs for different seeds", () => {
    expect(deriveRunId("event-1")).not.toBe(deriveRunId("event-2"));
  });

  test("produces a valid v4-shaped UUID", () => {
    const uuid = deriveRunId("some-event");
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});
