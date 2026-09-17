import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { deleteGmailConnection, getGmailConnection } from "@/lib/integrations/repo";
import { recordAuditEvent } from "@/lib/integrations/audit";
import { isSameOrigin } from "@/lib/security/origin";
import { reportError } from "@/lib/observability/report";

export async function POST(request: Request) {
  // B3: defense in depth behind Supabase's SameSite cookies.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getGmailConnection(supabase, user.id);

  if (connection) {
    try {
      await revokeToken(decryptSecret(connection.refresh_token_encrypted));
    } catch (error) {
      // Envelope may be undecryptable after a key change; still delete the row.
      reportError("gmail.disconnect.revoke_failed", error, { userId: user.id });
    }
    await deleteGmailConnection(supabase, user.id);
  }

  await recordAuditEvent(supabase, user.id, "gmail.disconnected", "succeeded");
  return NextResponse.json({ ok: true });
}
