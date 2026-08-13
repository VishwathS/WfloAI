export const GMAIL_OAUTH_STATE_COOKIE = "gmail_oauth_state";

export class GmailReconnectError extends Error {
  constructor() {
    super("Your Gmail connection expired — reconnect it in Settings.");
    this.name = "GmailReconnectError";
  }
}

export function getGoogleClientConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables.");
  }
  return { clientId, clientSecret };
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

// Never log the token response — it contains bearer secrets.
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleClientConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier
    })
  });

  if (!response.ok) {
    throw new Error("Google sign-in didn't complete — please try connecting again.");
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const { clientId, clientSecret } = getGoogleClientConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    let errorCode = "";
    try {
      errorCode = ((await response.json()) as { error?: string }).error ?? "";
    } catch {
      // non-JSON error body
    }
    if (errorCode === "invalid_grant") {
      throw new GmailReconnectError();
    }
    throw new Error("Couldn't refresh the Gmail connection — try again in a moment.");
  }

  const json = (await response.json()) as GoogleTokenResponse;
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token })
    });
  } catch {
    // Best-effort: the row is deleted regardless; Google expires it eventually.
  }
}

export async function fetchGmailProfileEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error("Couldn't read the connected Gmail profile — please try connecting again.");
  }
  const json = (await response.json()) as { emailAddress?: string };
  if (!json.emailAddress) {
    throw new Error("Couldn't read the connected Gmail profile — please try connecting again.");
  }
  return json.emailAddress;
}
