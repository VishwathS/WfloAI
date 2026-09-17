import { describe, expect, test } from "vitest";
import { safeRedirectPath } from "@/lib/security/redirect";

describe("safeRedirectPath", () => {
  test("allows an ordinary same-origin path", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
  });

  test("preserves query strings and fragments on an allowed path", () => {
    expect(safeRedirectPath("/workflows/abc?tab=runs#log")).toBe("/workflows/abc?tab=runs#log");
  });

  test("rejects a protocol-relative path", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
  });

  test("rejects an absolute URL", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
  });

  test("rejects a backslash-authority path", () => {
    // The WHATWG URL parser treats a backslash as "/" for http(s), so
    // "/\\evil.com" resolves to the evil.com origin.
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
  });

  test("rejects a path that only becomes protocol-relative after the parser strips whitespace", () => {
    expect(safeRedirectPath("/\n/evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\t\\evil.com")).toBe("/dashboard");
  });

  test("defaults empty, null and undefined to the root path", () => {
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
  });

  test("rejects a bare relative path with no leading slash", () => {
    expect(safeRedirectPath("evil.com")).toBe("/dashboard");
  });

  test("every rejected candidate resolves back to this origin", () => {
    const origin = "https://app.example.com";
    const hostile = [
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/\n/evil.com"
    ];

    for (const candidate of hostile) {
      const resolved = new URL(safeRedirectPath(candidate), origin);
      expect(resolved.origin).toBe(origin);
    }
  });
});
