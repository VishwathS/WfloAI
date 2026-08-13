import type { SupabaseClient } from "@supabase/supabase-js";
import type { CredentialType, GmailConnection, UserCredential } from "@/lib/types";

// The only sanctioned access path to gmail_connections and user_credentials.
// Every query filters by the non-optional userId — this is the ownership guard
// on the admin-client (Inngest) path where RLS is bypassed.

export async function getGmailConnection(
  supabase: SupabaseClient,
  userId: string
): Promise<GmailConnection | null> {
  const { data, error } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Gmail connection: ${error.message}`);
  }
  return (data as GmailConnection | null) ?? null;
}

export interface GmailConnectionUpsert {
  email: string;
  refreshTokenEncrypted: string | null;
  scopes: string[];
}

export async function upsertGmailConnection(
  supabase: SupabaseClient,
  userId: string,
  values: GmailConnectionUpsert
): Promise<void> {
  const existing = await getGmailConnection(supabase, userId);
  const refreshTokenEncrypted =
    values.refreshTokenEncrypted ?? existing?.refresh_token_encrypted ?? null;

  if (!refreshTokenEncrypted) {
    throw new Error("Connection didn't complete — please try connecting again.");
  }

  const mergedScopes = Array.from(new Set([...(existing?.scopes ?? []), ...values.scopes]));

  const { error } = await supabase.from("gmail_connections").upsert(
    {
      user_id: userId,
      email: values.email,
      refresh_token_encrypted: refreshTokenEncrypted,
      scopes: mergedScopes,
      status: "active",
      access_token_encrypted: null,
      access_token_expires_at: null
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`Failed to save Gmail connection: ${error.message}`);
  }
}

// Optimistic CAS on the observed expiry so concurrent refreshes result in a
// single Google refresh call — losers re-read and reuse the winner's token.
export async function updateGmailAccessTokenCache(
  supabase: SupabaseClient,
  userId: string,
  accessTokenEncrypted: string,
  expiresAt: string,
  observedExpiresAt: string | null
): Promise<boolean> {
  let query = supabase
    .from("gmail_connections")
    .update({
      access_token_encrypted: accessTokenEncrypted,
      access_token_expires_at: expiresAt
    })
    .eq("user_id", userId);

  query = observedExpiresAt === null
    ? query.is("access_token_expires_at", null)
    : query.eq("access_token_expires_at", observedExpiresAt);

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(`Failed to cache Gmail access token: ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

export async function markGmailReconnectRequired(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from("gmail_connections")
    .update({ status: "requires_reconnect", access_token_encrypted: null, access_token_expires_at: null })
    .eq("user_id", userId);
}

export async function deleteGmailConnection(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("gmail_connections").delete().eq("user_id", userId);
  if (error) {
    throw new Error(`Failed to delete Gmail connection: ${error.message}`);
  }
}

export async function getUserCredential(
  supabase: SupabaseClient,
  userId: string,
  credentialId: string
): Promise<UserCredential | null> {
  const { data, error } = await supabase
    .from("user_credentials")
    .select("*")
    .eq("id", credentialId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load credential: ${error.message}`);
  }
  return (data as UserCredential | null) ?? null;
}

export interface CredentialSummary {
  id: string;
  name: string;
  type: CredentialType;
  headerName?: string;
}
