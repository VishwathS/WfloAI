import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  exchangeCodeForTokens,
  fetchGoogleAccountEmail,
  GMAIL_OAUTH_STATE_COOKIE
} from "@/lib/gmail/oauth";
import { upsertGmailConnection } from "@/lib/integrations/repo";
import { recordAuditEvent } from "@/lib/integrations/audit";
import { reportError } from "@/lib/observability/report";

interface SealedState {
  nonce: string;
  userId: string;
  tier: "send" | "read";
  codeVerifier: string;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  function redirectToSettings(result: "connected" | "error") {
    const response = NextResponse.redirect(
      new URL(`/settings?gmail=${result}`, requestUrl.origin)
    );
    // The state cookie is single-use: deleted on every outcome.
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/api/integrations/gmail"
    });
    return response;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToSettings("error");
  }

  const code = requestUrl.searchParams.get("code");
  const stateNonce = requestUrl.searchParams.get("state");
  const sealedState = (await cookies()).get(GMAIL_OAUTH_STATE_COOKIE)?.value;

  if (!code || !stateNonce || !sealedState) {
    return redirectToSettings("error");
  }

  let state: SealedState;
  try {
    state = JSON.parse(decryptSecret(sealedState)) as SealedState;
  } catch (error) {
    // Sealed-state envelope failed to decrypt or parse: tampering, a stale
    // cookie, or an INTEGRATION_TOKEN_KEY change. All three matter.
    reportError("gmail.oauth.state_invalid", error, { userId: user.id });
    return redirectToSettings("error");
  }

  if (state.nonce !== stateNonce || state.userId !== user.id) {
    return redirectToSettings("error");
  }

  try {
    // Never log the token response — it contains bearer secrets.
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri: `${requestUrl.origin}/api/integrations/gmail/callback`,
      codeVerifier: state.codeVerifier
    });

    const email = await fetchGoogleAccountEmail(tokens.access_token);

    // Google may omit refresh_token on re-consent; upsertGmailConnection keeps
    // the stored one in that case and fails cleanly if none exists at all.
    await upsertGmailConnection(supabase, user.id, {
      email,
      refreshTokenEncrypted: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      scopes: tokens.scope.split(" ").filter(Boolean)
    });

    await recordAuditEvent(supabase, user.id, "gmail.connected", "succeeded");
    return redirectToSettings("connected");
  } catch (error) {
    // Token exchange, account-email fetch or connection upsert failed. Never log the
    // token response itself — reportError records message and stack only.
    reportError("gmail.oauth.exchange_failed", error, { userId: user.id });
    await recordAuditEvent(supabase, user.id, "gmail.connected", "failed");
    return redirectToSettings("error");
  }
}
