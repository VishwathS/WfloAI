import { describe, expect, test } from "vitest";
import {
  assertUrlAllowed,
  isBlockedHostname,
  isBlockedIpAddress
} from "@/lib/http/ssrfGuard";

describe("isBlockedIpAddress", () => {
  test("blocks loopback, private, link-local, CGNAT, metadata, multicast", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.1.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fe80::1",
      "fc00::1"
    ]) {
      expect(isBlockedIpAddress(address), address).toBe(true);
    }
  });

  test("unmaps IPv4-mapped IPv6 before checking", () => {
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });

  test("allows public unicast addresses", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("142.250.72.100")).toBe(false);
    expect(isBlockedIpAddress("2607:f8b0:4004:c07::71")).toBe(false);
  });

  test("blocks unparseable input", () => {
    expect(isBlockedIpAddress("not-an-ip")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  test("blocks localhost variants and cloud metadata hosts", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("LOCALHOST")).toBe(true);
    expect(isBlockedHostname("app.localhost")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("localhost.")).toBe(true);
  });

  test("allows normal hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
  });
});

describe("assertUrlAllowed", () => {
  test("rejects non-http protocols", () => {
    expect(() => assertUrlAllowed(new URL("ftp://example.com"))).toThrow();
    expect(() => assertUrlAllowed(new URL("file:///etc/passwd"))).toThrow();
  });

  test("rejects embedded credentials", () => {
    expect(() => assertUrlAllowed(new URL("https://user:pass@example.com"))).toThrow(
      "embedded credentials"
    );
  });

  test("rejects blocked hosts and IP literals", () => {
    expect(() => assertUrlAllowed(new URL("http://localhost:3000"))).toThrow();
    expect(() => assertUrlAllowed(new URL("http://169.254.169.254/"))).toThrow();
    expect(() => assertUrlAllowed(new URL("http://[::1]/"))).toThrow();
  });

  test("allows normal public URLs", () => {
    expect(() => assertUrlAllowed(new URL("https://httpbin.org/get"))).not.toThrow();
  });
});
