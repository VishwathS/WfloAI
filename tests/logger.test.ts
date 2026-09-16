import { afterEach, describe, expect, test, vi } from "vitest";
import { log } from "@/lib/observability/logger";
import { reportError } from "@/lib/observability/report";
import { REDACTED } from "@/lib/integrations/redact";

function captureError(fn: () => void): string {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  fn();
  const line = spy.mock.calls.map((call) => String(call[0])).join("\n");
  spy.mockRestore();
  return line;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  test("redacts credential-shaped context values instead of passing them through", () => {
    const line = captureError(() =>
      log("error", "test.event", {
        authorization: "Bearer fake-token-abc123",
        token: "fake-token-abc123",
        password: "hunter2",
        workflowId: "wf-1"
      })
    );

    expect(line).not.toContain("fake-token-abc123");
    expect(line).not.toContain("hunter2");
    expect(line).toContain(REDACTED);
    expect(line).toContain("wf-1");
  });

  test("redacts nested credential keys", () => {
    const line = captureError(() =>
      log("error", "test.event", {
        request: { headers: { "X-Api-Key": "fake-key-999" }, list: [{ secret: "fake-s" }] }
      })
    );

    expect(line).not.toContain("fake-key-999");
    expect(line).not.toContain("fake-s");
  });

  test("emits one parseable line carrying level and event", () => {
    const line = captureError(() => log("error", "test.event", { workflowId: "wf-1" }));
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("test.event");
    expect(parsed.workflowId).toBe("wf-1");
    expect(typeof parsed.ts).toBe("string");
  });

  test("survives unserializable context without losing the event", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const line = captureError(() => log("error", "test.event", circular));
    expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe("reportError", () => {
  test("redacts credential-shaped context on reported errors", () => {
    const line = captureError(() =>
      reportError("test.failure", new Error("boom"), { token: "fake-token-abc123" })
    );

    expect(line).not.toContain("fake-token-abc123");
    expect(line).toContain(REDACTED);
    expect(line).toContain("boom");
  });

  test("handles a thrown non-Error value", () => {
    const line = captureError(() => reportError("test.failure", "plain string failure"));
    expect(line).toContain("plain string failure");
    expect(line).toContain("NonError");
  });
});
