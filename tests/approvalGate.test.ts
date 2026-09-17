import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MONEY_SPENDING_ROUTES,
  WAITLIST_PATH,
  isApprovedUser,
  requiresApproval
} from "@/lib/auth/approval";
import { requiresAuth } from "@/lib/security/publicPaths";

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
    expect(requiresApproval("/workflows/8f3c1d2e")).toBe(true);
  });

  test("the waitlist page itself does not, or the redirect loops forever", () => {
    expect(requiresApproval(WAITLIST_PATH)).toBe(false);
  });

  // C2 cross-task remediation. /settings was gated, which made the deletion and
  // export the privacy policy promises unreachable for anyone not yet admitted.
  // The routes behind it were never approval-gated; only the page that reaches
  // them was.
  test("settings is reachable by an authenticated but unapproved user", () => {
    expect(requiresApproval("/settings")).toBe(false);
  });

  test("but settings still requires a session — it is not public", () => {
    // Opening the page to unapproved users must not open it to anonymous ones:
    // it lists the connected Gmail address and stored credential names.
    expect(requiresAuth("/settings")).toBe(true);
  });

  test("opening settings grants no dashboard, canvas or execution access", () => {
    expect(requiresApproval("/dashboard")).toBe(true);
    expect(requiresApproval("/workflows/8f3c1d2e")).toBe(true);
  });

  test("an unapproved user still cannot reach any money-spending route", () => {
    // Those are not gated by the proxy at all; each checks for itself.
    expect(MONEY_SPENDING_ROUTES.length).toBeGreaterThan(0);
    for (const routeFile of MONEY_SPENDING_ROUTES) {
      expect(readFileSync(new URL("../" + routeFile, import.meta.url), "utf8")).toContain(
        "requireApprovedUser"
      );
    }
  });

  test("no redirect loop: the page unapproved users are sent to is itself open", () => {
    // The proxy redirects them to WAITLIST_PATH. If that path required
    // approval, it would redirect to itself forever.
    expect(requiresApproval(WAITLIST_PATH)).toBe(false);
    expect(requiresAuth(WAITLIST_PATH)).toBe(true);
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
