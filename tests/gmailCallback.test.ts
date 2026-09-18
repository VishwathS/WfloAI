import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import { GMAIL_SCOPES } from "@/lib/gmail/scopes";

// Task 14. A token granted only gmail.send cannot call Gmail's users.getProfile,
// so the callback must learn the connected address from Google's OIDC userinfo
// endpoint, which the non-sensitive openid + email scopes authorize.

const ACCESS_TOKEN = "ya29.test-access-token-value";
const REFRESH_TOKEN = "1//test-refresh-token-value";
const USER_ID = "user-1";

let sealedCookie: string | undefined;
const upsertGmailConnection = vi.fn();
const recordAuditEvent = vi.fn();
const reportError = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (sealedCookie === undefined ? undefined : { value: sealedCookie })
  })
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) }
  })
}));
vi.mock("@/lib/integrations/repo", () => ({
  upsertGmailConnection: (...args: unknown[]) => upsertGmailConnection(...args)
}));
vi.mock("@/lib/integrations/audit", () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...args)
}));
vi.mock("@/lib/observability/report", () => ({
  reportError: (...args: unknown[]) => reportError(...args)
}));

const { GET } = await import("@/app/api/integrations/gmail/callback/route");

const GRANTED_SEND_ONLY = `openid https://www.googleapis.com/auth/userinfo.email ${GMAIL_SCOPES.send}`;

interface GoogleStub {
  userinfoStatus?: number;
  userinfoBody?: Record<string, unknown>;
}

function stubGoogle({ userinfoStatus = 200, userinfoBody }: GoogleStub = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({
        access_token: ACCESS_TOKEN,
        refresh_token: REFRESH_TOKEN,
        expires_in: 3599,
        scope: GRANTED_SEND_ONLY,
        id_token: "header.payload.signature"
      });
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return Response.json(
        userinfoBody ?? { sub: "1234", email: "person@example.com", email_verified: true },
        { status: userinfoStatus }
      );
    }
    // Anything else — notably gmail.googleapis.com users/me/profile — is what a
    // send-only token is refused for.
    return new Response("forbidden", { status: 403 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function seal(overrides: Partial<{ nonce: string; userId: string }> = {}) {
  sealedCookie = encryptSecret(
    JSON.stringify({
      nonce: "nonce-1",
      userId: USER_ID,
      tier: "send",
      codeVerifier: "verifier-1",
      ...overrides
    })
  );
}

async function callback(query = "?code=auth-code&state=nonce-1") {
  const response = await GET(new Request(`https://app.test/api/integrations/gmail/callback${query}`));
  return { response, location: response.headers.get("location") ?? "" };
}

function everythingObservable(fetchMock: ReturnType<typeof vi.fn>, location: string): string {
  return JSON.stringify({
    location,
    reported: reportError.mock.calls,
    audited: recordAuditEvent.mock.calls,
    upsertEmails: upsertGmailConnection.mock.calls.map((call) => (call[2] as { email: string }).email),
    fetched: fetchMock.mock.calls.map((call) => String(call[0]))
  });
}

describe("gmail callback with a send-only grant", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.INTEGRATION_TOKEN_KEY = randomBytes(32).toString("base64");
    upsertGmailConnection.mockReset();
    recordAuditEvent.mockReset();
    reportError.mockReset();
    seal();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reads the address from OIDC userinfo and persists the connection", async () => {
    const fetchMock = stubGoogle();

    const { location } = await callback();

    expect(location).toBe("https://app.test/settings?gmail=connected");
    expect(upsertGmailConnection).toHaveBeenCalledTimes(1);
    const [, userId, values] = upsertGmailConnection.mock.calls[0] as [
      unknown,
      string,
      { email: string; refreshTokenEncrypted: string; scopes: string[] }
    ];
    expect(userId).toBe(USER_ID);
    expect(values.email).toBe("person@example.com");
    expect(values.scopes).toContain(GMAIL_SCOPES.send);
    expect(values.scopes).not.toContain(GMAIL_SCOPES.compose);
    expect(values.scopes).not.toContain(GMAIL_SCOPES.readonly);
    expect(values.refreshTokenEncrypted).not.toContain(REFRESH_TOKEN);

    const userinfoCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === "https://openidconnect.googleapis.com/v1/userinfo"
    );
    expect(userinfoCall).toBeDefined();
    const headers = new Headers(userinfoCall?.[1]?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("gmail.googleapis.com"))).toBe(
      false
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.anything(), USER_ID, "gmail.connected", "succeeded");
  });

  test.each([
    ["userinfo refuses the token", { userinfoStatus: 401 }],
    ["userinfo returns no email", { userinfoBody: { sub: "1234" } }],
    ["userinfo reports an unverified email", { userinfoBody: { sub: "1", email: "x@example.com", email_verified: false } }],
    ["userinfo returns a non-string email", { userinfoBody: { sub: "1", email: 42 } }]
  ])("%s: nothing is persisted and the user lands on the error message", async (_label, stub) => {
    const fetchMock = stubGoogle(stub);

    const { location } = await callback();

    expect(location).toBe("https://app.test/settings?gmail=error");
    expect(upsertGmailConnection).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.anything(), USER_ID, "gmail.connected", "failed");
    const observable = everythingObservable(fetchMock, location);
    expect(observable).not.toContain(ACCESS_TOKEN);
    expect(observable).not.toContain(REFRESH_TOKEN);
  });

  test("a state nonce mismatch exchanges no code and calls no Google endpoint", async () => {
    const fetchMock = stubGoogle();
    seal({ nonce: "someone-elses-nonce" });

    const { location } = await callback();

    expect(location).toBe("https://app.test/settings?gmail=error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertGmailConnection).not.toHaveBeenCalled();
  });

  test("a state bound to another user is refused before any exchange", async () => {
    const fetchMock = stubGoogle();
    seal({ userId: "user-2" });

    const { location } = await callback();

    expect(location).toBe("https://app.test/settings?gmail=error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("the state cookie is cleared on success and on failure", async () => {
    stubGoogle();
    const ok = await callback();
    expect(ok.response.headers.get("set-cookie")).toMatch(/gmail_oauth_state=;.*Max-Age=0/i);

    stubGoogle({ userinfoStatus: 500 });
    seal();
    const failed = await callback();
    expect(failed.response.headers.get("set-cookie")).toMatch(/gmail_oauth_state=;.*Max-Age=0/i);
  });
});
