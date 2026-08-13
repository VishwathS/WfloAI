import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getGmailConnection } from "@/lib/integrations/repo";
import { GMAIL_SCOPES, gmailReadActionsEnabled } from "@/lib/gmail/scopes";

export async function GET() {
  const supabase = createServerSupabaseClient();
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
    readActionsEnabled: gmailReadActionsEnabled()
  });
}
