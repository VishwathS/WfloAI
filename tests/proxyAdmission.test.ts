import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// A3. Runs the real proxy() with a faked session and profile row, so the
// routing decisions are asserted as behaviour rather than read from source:
// where an approved, an unapproved and an anonymous user each end up, and
// that no path redirects to itself.

const state = {
  user: { id: "user-1" } as { id: string } | null,
  approved: false as boolean | null
};

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: state.approved === null ? null : { approved: state.approved },
            error: null
          })
        })
      })
    })
  };
}

vi.mock("@/lib/supabase/server", () => ({
  updateSession: () => ({ supabase: fakeClient(), response: NextResponse.next() })
}));

const { proxy } = await import("@/proxy");

async function visit(path: string): Promise<string | null> {
  const response = await proxy(new NextRequest(`https://app.test${path}`));
  const location = response.headers.get("location");

  return location ? new URL(location).pathname : null;
}

beforeEach(() => {
  state.user = { id: "user-1" };
  state.approved = false;
});

describe("an existing approved user", () => {
  beforeEach(() => {
    state.approved = true;
  });

  test.each(["/dashboard", "/workflows/wf-1", "/settings"])("reaches %s directly", async (path) => {
    expect(await visit(path)).toBeNull();
  });

  test("is sent from the invite page to the dashboard", async () => {
    expect(await visit("/waitlist")).toBe("/dashboard");
  });

  test("is sent from login to the dashboard", async () => {
    expect(await visit("/login")).toBe("/dashboard");
  });
});

describe("a new, unapproved user", () => {
  test.each(["/dashboard", "/workflows/wf-1"])("is sent from %s to the invite page", async (path) => {
    expect(await visit(path)).toBe("/waitlist");
  });

  test("stays on the invite page — no redirect loop", async () => {
    expect(await visit("/waitlist")).toBeNull();
  });

  test("can still reach settings, for export and account deletion", async () => {
    expect(await visit("/settings")).toBeNull();
  });

  test.each(["/", "/privacy", "/terms"])("can read public page %s", async (path) => {
    expect(await visit(path)).toBeNull();
  });

  test("with no profile row at all is treated as unapproved", async () => {
    state.approved = null;

    expect(await visit("/dashboard")).toBe("/waitlist");
  });
});

describe("an anonymous visitor", () => {
  beforeEach(() => {
    state.user = null;
  });

  test.each(["/dashboard", "/waitlist", "/settings"])("is sent from %s to login", async (path) => {
    expect(await visit(path)).toBe("/login");
  });

  test("can reach login without a loop", async () => {
    expect(await visit("/login")).toBeNull();
  });
});
