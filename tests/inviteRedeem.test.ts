import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { INVITE_OUTCOMES } from "@/lib/auth/invite";

// A3 follow-up. The redemption logic and the attempt limit live in SQL
// (redeem_invite_code), so these tests fake the RPC and assert what the route
// does with each outcome. The SQL itself was exercised against a real Postgres
// when the migration was written; the source assertions at the bottom pin the
// properties that make it safe, so a later edit cannot quietly drop one.

const state = {
  user: { id: "user-1" } as { id: string } | null,
  outcome: "approved" as string | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[]
};

function reset() {
  state.user = { id: "user-1" };
  state.outcome = "approved";
  state.rpcError = null;
  state.rpcCalls = [];
}

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: state.rpcError ? null : state.outcome, error: state.rpcError };
    }
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => fakeClient()
}));

vi.mock("@/lib/observability/report", () => ({ reportError: () => undefined }));

const { POST } = await import("@/app/api/invite/redeem/route");

function request(body: unknown, origin = "https://app.test"): Request {
  return new Request("https://app.test/api/invite/redeem", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

beforeEach(reset);

describe("guards before the RPC", () => {
  test("a cross-origin request is refused and never reaches the RPC", async () => {
    const response = await POST(request({ code: "abc" }, "https://evil.test"));

    expect(response.status).toBe(403);
    expect(state.rpcCalls).toEqual([]);
  });

  test("an unauthenticated caller gets 401", async () => {
    state.user = null;

    const response = await POST(request({ code: "abc" }));

    expect(response.status).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  test("an empty code is refused without spending an attempt", async () => {
    const response = await POST(request({ code: "   " }));

    expect(response.status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });

  test("an overlong code is reported as invalid without calling the RPC", async () => {
    const response = await POST(request({ code: "x".repeat(65) }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: INVITE_OUTCOMES.invalid.message });
    expect(state.rpcCalls).toEqual([]);
  });

  test("malformed JSON is a 400", async () => {
    const response = await POST(request("{not json"));

    expect(response.status).toBe(400);
  });

  test("the code is trimmed and passed as the only argument", async () => {
    await POST(request({ code: "  abc  " }));

    expect(state.rpcCalls).toEqual([{ fn: "redeem_invite_code", args: { p_code: "abc" } }]);
  });
});

describe("outcomes", () => {
  test("approved returns 200 with approved: true", async () => {
    const response = await POST(request({ code: "abc" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ approved: true });
  });

  test("already approved is a 200, so the form still routes to the dashboard", async () => {
    state.outcome = "already_approved";

    const response = await POST(request({ code: "abc" }));

    expect(response.status).toBe(200);
  });

  test.each(["invalid", "expired", "exhausted"])("%s is a 400 with its own message", async (outcome) => {
    state.outcome = outcome;

    const response = await POST(request({ code: "abc" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: INVITE_OUTCOMES[outcome].message });
  });

  test("rate_limited is a 429 with Retry-After", async () => {
    state.outcome = "rate_limited";

    const response = await POST(request({ code: "abc" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    await expect(response.json()).resolves.toEqual({
      error: INVITE_OUTCOMES.rate_limited.message
    });
  });

  test("an unknown outcome fails closed with a generic 500", async () => {
    state.outcome = "something_new";

    const response = await POST(request({ code: "abc" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.not.toHaveProperty("approved");
  });

  test("an RPC error is a generic 500 that leaks no database detail", async () => {
    state.rpcError = { message: 'relation "public.invite_codes" does not exist' };

    const response = await POST(request({ code: "abc" }));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).not.toContain("invite_codes");
  });
});

describe("messages reveal nothing about the inventory", () => {
  test.each(Object.entries(INVITE_OUTCOMES))("%s message names no counts or limits", (_, { message }) => {
    expect(message).not.toMatch(/\d/);
    expect(message.toLowerCase()).not.toMatch(/max|uses left|remaining|other user/);
  });

  test("disabled is not a distinct outcome — it reads as invalid", () => {
    expect(INVITE_OUTCOMES).not.toHaveProperty("disabled");
  });
});

describe("the migration keeps the limit where a direct RPC cannot skip it", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/202609170001_add_invite_redemption_rate_limit.sql", import.meta.url),
    "utf8"
  );
  const body = sql.slice(sql.indexOf("create or replace function public.redeem_invite_code"));

  test("the limit is enforced inside redeem_invite_code", () => {
    expect(body).toContain("return 'rate_limited'");
  });

  test("a user's concurrent attempts are serialised before counting", () => {
    expect(body.indexOf("pg_advisory_xact_lock")).toBeGreaterThan(-1);
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(body.indexOf("count(*)"));
  });

  test("the attempt is recorded before the code is looked up", () => {
    expect(body.indexOf("insert into public.invite_redemption_attempts")).toBeLessThan(
      body.indexOf("from public.invite_codes")
    );
  });

  test("the last seat is still protected by a row lock", () => {
    expect(body).toMatch(/from public\.invite_codes[\s\S]*?for update/);
  });

  test("the function never raises, so the recorded attempt always commits", () => {
    expect(body).not.toMatch(/\braise\b/i);
  });

  test("clients get no write policy on the attempt table", () => {
    expect(sql).not.toMatch(/on public\.invite_redemption_attempts\s+for (insert|update|delete|all)/i);
  });

  test("anon loses EXECUTE on both functions", () => {
    expect(sql).toContain("revoke all on function public.redeem_invite_code(text) from public, anon;");
    expect(sql).toMatch(/revoke all on function public\.consume_action_quota\([^)]*\) from public, anon;/);
  });

  test("invite_codes gains no policy", () => {
    expect(sql).not.toMatch(/on public\.invite_codes/i);
  });
});

describe("the invite page does not promise access from waiting", () => {
  const page = readFileSync(new URL("../app/(auth)/waitlist/page.tsx", import.meta.url), "utf8");

  test("the old waitlist promises are gone", () => {
    expect(page).not.toContain("You are on the list");
    expect(page).not.toContain("let in from the list");
    expect(page).not.toContain("Nothing more is needed");
  });

  test("it says the product is invite-only", () => {
    expect(page).toContain("invite-only");
  });
});
