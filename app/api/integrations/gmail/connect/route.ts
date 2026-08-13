import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { getGoogleClientConfig, GMAIL_OAUTH_STATE_COOKIE } from "@/lib/gmail/oauth";
import { scopesForTier, type GmailTier } from "@/lib/gmail/scopes";

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const tier: GmailTier = requestUrl.searchParams.get("tier") === "read" ? "read" : "send";

  const { clientId } = getGoogleClientConfig();
  const redirectUri = `${requestUrl.origin}/api/integrations/gmail/callback`;
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  const nonce = randomUUID();

  const consentUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("response_type", "code");
  consentUrl.searchParams.set("scope", scopesForTier(tier).join(" "));
  consentUrl.searchParams.set("access_type", "offline");
  consentUrl.searchParams.set("prompt", "consent");
  consentUrl.searchParams.set("include_granted_scopes", "true");
  consentUrl.searchParams.set("state", nonce);
  consentUrl.searchParams.set("code_challenge", codeChallenge);
  consentUrl.searchParams.set("code_challenge_method", "S256");

  // Sealed state binds the nonce to the authenticated user and requested tier
  // so a send-tier callback can't be replayed as read-tier or across users.
  const sealedState = encryptSecret(
    JSON.stringify({ nonce, userId: user.id, tier, codeVerifier })
  );

  const response = NextResponse.redirect(consentUrl);
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, sealedState, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/integrations/gmail"
  });
  return response;
}
