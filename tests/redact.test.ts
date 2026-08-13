import { describe, expect, test } from "vitest";
import { REDACTED, redactSecrets, redactSensitiveKeys } from "@/lib/integrations/redact";

describe("redactSecrets", () => {
  test("removes every occurrence of a credential value", () => {
    const token = "fake-token-abc123";
    const echoed = `{"headers":{"Authorization":"Bearer ${token}"},"again":"${token}"}`;
    const result = redactSecrets(echoed, [token]);
    expect(result).not.toContain(token);
    expect(result.match(/\[REDACTED\]/g)).toHaveLength(2);
  });

  test("catches credentials echoed under unexpected keys", () => {
    const result = redactSecrets('{"weird_field":"fake-key-999"}', ["fake-key-999"]);
    expect(result).toContain(REDACTED);
  });

  test("ignores empty and trivially short values", () => {
    expect(redactSecrets("abc def", ["", "ab"])).toBe("abc def");
  });
});

describe("redactSensitiveKeys", () => {
  test("redacts sensitive keys recursively and case-insensitively", () => {
    const result = redactSensitiveKeys({
      Authorization: "Bearer x",
      nested: { "X-Api-Key": "k", list: [{ password: "p" }] },
      safe: "keep"
    }) as Record<string, unknown>;

    expect(result.Authorization).toBe(REDACTED);
    expect((result.nested as Record<string, unknown>)["X-Api-Key"]).toBe(REDACTED);
    expect(
      ((result.nested as { list: Array<Record<string, unknown>> }).list[0]).password
    ).toBe(REDACTED);
    expect(result.safe).toBe("keep");
  });
});
