import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MONEY_SPENDING_ROUTES,
  WAITLIST_PATH,
  isApprovedUser,
  requiresApproval
} from "@/lib/auth/approval";

// A3. The DB-level assertions this task also asks for — a profiles row created
// on first login, and RLS preventing one user reading another row — need a live
// Postgres, which this suite has no fixture for (MASTER section 7.7). They are
// recorded as outstanding in the task file rather than faked. What is asserted
// here is every part of the gate that is a pure decision or a source fact.

type ProfileRow = { approved: boolean } | null;

function fakeSupabase(row: ProfileRow, error: unknown = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error })
        })
      })
    })
  } as unknown as SupabaseClient;
}

describe("which paths need approval", () => {
  test("protected pages need it", () => {
    expect(requiresApproval("/dashboard")).toBe(true);
    expect(requiresApproval("/settings")).toBe(true);
    expect(requiresApproval("/workflows/8f3c1d2e")).toBe(true);
  });

  test("the waitlist page itself does not, or the redirect loops forever", () => {
    expect(requiresApproval(WAITLIST_PATH)).toBe(false);
  });

  test("public pages do not, because they never needed a session either", () => {
    expect(requiresApproval("/")).toBe(false);
    expect(requiresApproval("/privacy")).toBe(false);
    expect(requiresApproval("/terms")).toBe(false);
    expect(requiresApproval("/login")).toBe(false);
  });

  test("the gate composes with the auth allow-list rather than restating it", () => {
    // Anything the proxy lets through unauthenticated must also be reachable
    // by a signed-in but unapproved user. This is the collision task 08 warns
    // about, in the opposite direction from task 07.
    expect(requiresApproval("/auth/callback")).toBe(false);
  });

  test("API paths are not gated here — each spending route checks itself", () => {
    expect(requiresApproval("/api/execute")).toBe(false);
    expect(requiresApproval("/api/lookup")).toBe(false);
  });
});

describe("isApprovedUser fails closed", () => {
  test("approves only an explicit true", async () => {
    expect(await isApprovedUser(fakeSupabase({ approved: true }), "u1")).toBe(true);
  });

  test("an unapproved row is not approved", async () => {
    expect(await isApprovedUser(fakeSupabase({ approved: false }), "u1")).toBe(false);
  });

  test("a missing profile row is not approved", async () => {
    expect(await isApprovedUser(fakeSupabase(null), "u1")).toBe(false);
  });

  test("a query error is not approved — the gate must not open on failure", async () => {
    expect(await isApprovedUser(fakeSupabase(null, { message: "boom" }), "u1")).toBe(false);
  });
});

describe("the money-spending routes carry the guard", () => {
  // A gate that only covers pages is not a cost control, and these routes are
  // reachable directly. This reads the source rather than the behaviour because
  // there is no HTTP harness; what it protects against is a future edit
  // dropping the check from one route while the others keep it.
  test.each(MONEY_SPENDING_ROUTES)("%s calls requireApprovedUser", (routeFile) => {
    const source = readFileSync(new URL("../" + routeFile, import.meta.url), "utf8");

    expect(source).toContain("requireApprovedUser");
    expect(source).toContain("return denied;");
  });

  test("the list covers both single-step routes the task names specifically", () => {
    expect(MONEY_SPENDING_ROUTES).toContain("app/api/execute/route.ts");
    expect(MONEY_SPENDING_ROUTES).toContain("app/api/lookup/route.ts");
  });

  test("and the primary run path, which the task does not name but which spends most", () => {
    expect(MONEY_SPENDING_ROUTES).toContain("app/api/workflows/[id]/execute/route.ts");
  });
});

describe("the scheduled path is gated too", () => {
  test("runScheduledWorkflow skips an unapproved account", () => {
    const source = readFileSync(new URL("../lib/inngest/functions.ts", import.meta.url), "utf8");

    expect(source).toContain("isApprovedUser");
    expect(source).toContain("Account is not approved.");
  });
});
