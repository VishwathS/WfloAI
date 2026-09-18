import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GMAIL_SCOPES, scopesForTier } from "@/lib/gmail/scopes";

// Task 14 / A15. V1 Gmail is gmail.send only. Requesting any Restricted scope
// moves the whole integration into a CASA security assessment, so what the
// connect route actually asks Google for is the property that matters.

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }
  })
}));

const { GET } = await import("@/app/api/integrations/gmail/connect/route");

async function requestedScopes(path: string): Promise<{ status: number; scopes: string[] }> {
  const response = await GET(new Request(`https://app.test${path}`));
  const location = response.headers.get("location");
  const scope = location ? new URL(location).searchParams.get("scope") : null;
  return { status: response.status, scopes: scope ? scope.split(" ") : [] };
}

describe("the send tier is exactly gmail.send", () => {
  test("scopesForTier('send') returns only gmail.send", () => {
    // The A15 regression guard: without it a future edit silently re-crosses
    // the Restricted line at initial connect.
    expect(scopesForTier("send")).toEqual([GMAIL_SCOPES.send]);
  });
});

describe("the connect route never requests a Restricted scope while the flag is off", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.INTEGRATION_TOKEN_KEY = randomBytes(32).toString("base64");
    delete process.env.GMAIL_READ_ACTIONS_ENABLED;
  });

  afterEach(() => {
    delete process.env.GMAIL_READ_ACTIONS_ENABLED;
  });

  test("a plain connect asks Google for gmail.send only", async () => {
    const { status, scopes } = await requestedScopes("/api/integrations/gmail/connect");

    expect(status).toBe(307);
    expect(scopes).toEqual([GMAIL_SCOPES.send]);
  });

  test("?tier=read is refused, not honoured, when the flag is off", async () => {
    // The Settings card hides the "Enable email reading" link when the flag is
    // off, but the link is just a URL — any signed-in user can type it. The
    // server must refuse, or the app requests gmail.compose and gmail.readonly
    // and stores whatever Google grants.
    const { status, scopes } = await requestedScopes("/api/integrations/gmail/connect?tier=read");

    expect(status).toBe(403);
    expect(scopes).not.toContain(GMAIL_SCOPES.compose);
    expect(scopes).not.toContain(GMAIL_SCOPES.readonly);
  });

  test.each(["TRUE", "1", "yes"])(
    "a flag value of %j is not exactly \"true\" and still refuses",
    async (value) => {
      process.env.GMAIL_READ_ACTIONS_ENABLED = value;
      const { status } = await requestedScopes("/api/integrations/gmail/connect?tier=read");

      expect(status).toBe(403);
    }
  );

  test("with the flag deliberately on, the read tier is reachable (deferred D1 path)", async () => {
    process.env.GMAIL_READ_ACTIONS_ENABLED = "true";
    const { status, scopes } = await requestedScopes("/api/integrations/gmail/connect?tier=read");

    expect(status).toBe(307);
    expect(scopes).toContain(GMAIL_SCOPES.readonly);
  });
});
