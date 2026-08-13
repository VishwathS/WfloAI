import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GmailReconnectError, refreshAccessToken } from "@/lib/gmail/oauth";
import {
  getGmailConnection,
  markGmailReconnectRequired,
  updateGmailAccessTokenCache
} from "@/lib/integrations/repo";
import { recordAuditEvent } from "@/lib/integrations/audit";

export const GMAIL_NOT_CONNECTED_MESSAGE =
  "Connect your Gmail account in Settings before running this node.";

const EXPIRY_BUFFER_MS = 60_000;

export interface GmailAccess {
  token: string;
  scopes: string[];
}

export async function getGmailAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<GmailAccess> {
  const connection = await getGmailConnection(supabase, userId);
  if (!connection) {
    throw new Error(GMAIL_NOT_CONNECTED_MESSAGE);
  }
  if (connection.status === "requires_reconnect") {
    throw new GmailReconnectError();
  }

  const expiresAt = connection.access_token_expires_at;
  if (
    connection.access_token_encrypted &&
    expiresAt &&
    new Date(expiresAt).getTime() - Date.now() > EXPIRY_BUFFER_MS
  ) {
    try {
      return {
        token: decryptSecret(connection.access_token_encrypted),
        scopes: connection.scopes
      };
    } catch {
      // Undecryptable cache (key changed) — fall through to a fresh refresh.
    }
  }

  try {
    const refreshed = await refreshAccessToken(decryptSecret(connection.refresh_token_encrypted));
    const newExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();

    // CAS on the observed expiry: if another execution refreshed first, reuse
    // its cached token instead of keeping a second refresh result.
    const won = await updateGmailAccessTokenCache(
      supabase,
      userId,
      encryptSecret(refreshed.accessToken),
      newExpiresAt,
      expiresAt
    );

    if (!won) {
      const winner = await getGmailConnection(supabase, userId);
      if (winner?.access_token_encrypted) {
        try {
          return { token: decryptSecret(winner.access_token_encrypted), scopes: winner.scopes };
        } catch {
          // fall back to our own freshly refreshed token
        }
      }
    }

    return { token: refreshed.accessToken, scopes: connection.scopes };
  } catch (error) {
    if (error instanceof GmailReconnectError) {
      // Persist the lifecycle state so future runs fail fast instead of
      // hammering Google's token endpoint with a dead refresh token.
      await markGmailReconnectRequired(supabase, userId);
      await recordAuditEvent(supabase, userId, "gmail.reconnect_required", "failed");
    }
    throw error;
  }
}

export async function gmailFetch<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new GmailReconnectError();
    }
    if (response.status === 403) {
      throw new Error("Gmail denied this action — check the permissions granted in Settings.");
    }
    if (response.status === 429) {
      throw new Error("Gmail rate limit reached — try again in a minute.");
    }
    throw new Error(`Gmail request failed (status ${response.status}).`);
  }

  return (await response.json()) as T;
}
