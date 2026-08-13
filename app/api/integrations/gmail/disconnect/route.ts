import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { deleteGmailConnection, getGmailConnection } from "@/lib/integrations/repo";
import { recordAuditEvent } from "@/lib/integrations/audit";

export async function POST() {
  const supabase = createServerSupabaseClient();
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
    } catch {
      // Envelope may be undecryptable after a key change; still delete the row.
    }
    await deleteGmailConnection(supabase, user.id);
  }

  await recordAuditEvent(supabase, user.id, "gmail.disconnected", "succeeded");
  return NextResponse.json({ ok: true });
}
