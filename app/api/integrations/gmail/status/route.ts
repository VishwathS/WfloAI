import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getGmailConnection } from "@/lib/integrations/repo";
import { GMAIL_SCOPES, gmailReadActionsEnabled } from "@/lib/gmail/scopes";
import { gmailSendUsage } from "@/lib/integrations/limits";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getGmailConnection(supabase, user.id);

  if (!connection) {
    return NextResponse.json({
      connected: false,
      readActionsEnabled: gmailReadActionsEnabled()
    });
  }

  return NextResponse.json({
    connected: true,
    email: connection.email,
    status: connection.status,
    canSend: connection.scopes.includes(GMAIL_SCOPES.send),
    canRead: connection.scopes.includes(GMAIL_SCOPES.readonly),
    readActionsEnabled: gmailReadActionsEnabled(),
    // A14a: sending limits are shown alongside the connection rather than in a
    // separate card, because they are a property of it.
    usage: await gmailSendUsage(supabase, user.id)
  });
}
