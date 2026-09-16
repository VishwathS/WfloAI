import { describe, expect, test } from "vitest";
import { isSameOrigin } from "@/lib/security/origin";

function post(url: string, origin?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: origin === undefined ? {} : { origin }
  });
}

describe("isSameOrigin", () => {
  test("accepts a request whose Origin matches the request URL", () => {
    expect(isSameOrigin(post("https://app.example.com/api/x", "https://app.example.com"))).toBe(
      true
    );
  });

  test("rejects a cross-site Origin", () => {
    expect(isSameOrigin(post("https://app.example.com/api/x", "https://evil.com"))).toBe(false);
  });

  test("rejects a matching host on a different scheme or port", () => {
    expect(isSameOrigin(post("https://app.example.com/api/x", "http://app.example.com"))).toBe(
      false
    );
    expect(isSameOrigin(post("https://app.example.com/api/x", "https://app.example.com:8443"))).toBe(
      false
    );
  });

  test("rejects a missing Origin header", () => {
    // Browsers always send Origin on non-GET requests; absence means the caller
    // is not the browser flow these routes support.
    expect(isSameOrigin(post("https://app.example.com/api/x"))).toBe(false);
  });

  test("rejects an unparseable Origin", () => {
    expect(isSameOrigin(post("https://app.example.com/api/x", "not-a-url"))).toBe(false);
  });

  test("rejects the literal null Origin sent by sandboxed contexts", () => {
    expect(isSameOrigin(post("https://app.example.com/api/x", "null"))).toBe(false);
  });
});
