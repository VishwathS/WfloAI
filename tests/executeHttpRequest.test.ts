import { describe, expect, it } from "vitest";
import { isTextualContentType, nextHop, type HopState } from "@/lib/http/executeHttpRequest";

function hop(overrides: Partial<HopState> = {}): HopState {
  return {
    url: new URL("https://api.example.com/resource"),
    method: "POST",
    body: '{"a":1}',
    includeCredentials: true,
    ...overrides
  };
}

describe("isTextualContentType", () => {
  it("treats text, JSON, XML, form and JS payloads as textual", () => {
    for (const type of [
      "text/plain",
      "text/html; charset=utf-8",
      "application/json",
      "application/problem+json",
      "application/xml",
      "application/x-www-form-urlencoded",
      "application/javascript"
    ]) {
      expect(isTextualContentType(type)).toBe(true);
    }
  });

  it("treats binary payloads as non-textual so raw bytes never reach node output", () => {
    for (const type of [
      "image/png",
      "application/pdf",
      "application/octet-stream",
      "audio/mpeg",
      "video/mp4",
      "application/zip"
    ]) {
      expect(isTextualContentType(type)).toBe(false);
    }
  });

  it("is case-insensitive", () => {
    expect(isTextualContentType("APPLICATION/JSON")).toBe(true);
    expect(isTextualContentType("IMAGE/PNG")).toBe(false);
  });
});

describe("nextHop redirect handling", () => {
  it("downgrades 301/302/303 to GET and drops the body", () => {
    for (const status of [301, 302, 303]) {
      const next = nextHop(hop(), status, "https://api.example.com/moved", true);
      expect(next.method).toBe("GET");
      expect(next.body).toBeUndefined();
    }
  });

  it("preserves method and body on 307/308", () => {
    for (const status of [307, 308]) {
      const next = nextHop(hop(), status, "https://api.example.com/moved", true);
      expect(next.method).toBe("POST");
      expect(next.body).toBe('{"a":1}');
    }
  });

  it("keeps credentials on a same-origin redirect", () => {
    const next = nextHop(hop(), 307, "https://api.example.com/other", true);
    expect(next.includeCredentials).toBe(true);
  });

  it("strips credentials on a cross-origin redirect", () => {
    const next = nextHop(hop(), 307, "https://attacker.example.net/collect", true);
    expect(next.includeCredentials).toBe(false);
  });

  it("keeps credentials stripped once dropped, even returning to the original origin", () => {
    const first = nextHop(hop(), 307, "https://attacker.example.net/collect", true);
    const second = nextHop(first, 307, "https://api.example.com/resource", true);
    expect(second.includeCredentials).toBe(false);
  });

  it("rejects an HTTPS→HTTP downgrade when credentials are in play", () => {
    expect(() =>
      nextHop(hop({ body: undefined }), 302, "http://api.example.com/insecure", true)
    ).toThrow(/HTTPS to HTTP/i);
  });

  it("rejects an HTTPS→HTTP downgrade when a body is in play", () => {
    expect(() => nextHop(hop(), 307, "http://api.example.com/insecure", false)).toThrow(
      /HTTPS to HTTP/i
    );
  });

  it("re-validates the redirect target against the SSRF guard", () => {
    expect(() => nextHop(hop(), 302, "http://169.254.169.254/latest/meta-data/", false)).toThrow();
    expect(() => nextHop(hop(), 302, "http://127.0.0.1:8080/admin", false)).toThrow();
    expect(() => nextHop(hop(), 302, "http://localhost:3000/", false)).toThrow();
  });

  it("resolves relative redirect targets against the current hop", () => {
    const next = nextHop(hop(), 303, "/v2/resource", false);
    expect(next.url.href).toBe("https://api.example.com/v2/resource");
  });

  it("rejects an unparseable Location header", () => {
    expect(() => nextHop(hop(), 302, "http://[not a url", false)).toThrow(/invalid redirect/i);
  });
});
