import { describe, expect, test } from "vitest";
import { requiresAuth } from "@/lib/security/publicPaths";

// A1 + A4. The task 07 verification asks for "a test asserting /, /privacy and
// /terms return 200 while unauthenticated ... the check that catches the
// middleware collision with task 01". This suite has no HTTP harness, so the
// assertion is made one level down, against the predicate the proxy actually
// uses to decide. That is where the collision would live: a page added by task
// 07 that task 01 allow-list does not know about is gated, and this fails.

describe("public paths", () => {
  test("the marketing homepage is reachable without a session", () => {
    expect(requiresAuth("/")).toBe(false);
  });

  test("both legal pages are reachable without a session", () => {
    expect(requiresAuth("/privacy")).toBe(false);
    expect(requiresAuth("/terms")).toBe(false);
  });

  test("the login page and the auth callback stay public", () => {
    expect(requiresAuth("/login")).toBe(false);
    expect(requiresAuth("/auth/callback")).toBe(false);
  });
});

describe("gated paths", () => {
  test("the dashboard is gated now that it no longer lives at /", () => {
    expect(requiresAuth("/dashboard")).toBe(true);
  });

  test("settings and the canvas stay gated", () => {
    expect(requiresAuth("/settings")).toBe(true);
    expect(requiresAuth("/workflows/8f3c1d2e")).toBe(true);
  });

  test("an unknown page is gated by default", () => {
    // The allow-list exists so that a new route is private until someone says
    // otherwise. A deny-list would have made this true, which is the bug A4
    // was about.
    expect(requiresAuth("/some-future-page")).toBe(true);
  });

  test("a path that merely starts with a public path is still gated", () => {
    expect(requiresAuth("/privacy-policy-archive")).toBe(true);
    expect(requiresAuth("/terms-of-art")).toBe(true);
  });
});

describe("paths the proxy deliberately does not gate", () => {
  test("API routes enforce their own 401 and are not redirected to HTML", () => {
    expect(requiresAuth("/api/workflows/abc/execute")).toBe(false);
    expect(requiresAuth("/api/inngest")).toBe(false);
  });

  test("framework internals pass through", () => {
    expect(requiresAuth("/_next/static/chunk.js")).toBe(false);
  });
});
