import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameOrigin } from "@/lib/security/origin";
import { decryptSecret } from "@/lib/crypto";
import { revokeToken } from "@/lib/gmail/oauth";
import { getGmailConnection } from "@/lib/integrations/repo";
import { deleteAccount, deleteStoragePrefix } from "@/lib/account/deleteAccount";
import { reportError } from "@/lib/observability/report";

// The user types this exactly. A click-through is not enough for an
// irreversible, unrecoverable operation.
export const DELETE_CONFIRMATION = "DELETE MY ACCOUNT";

interface DeleteBody {
  confirmation?: unknown;
}

const STEP_MESSAGES: Record<string, string> = {
  revoke_gmail:
    "Could not revoke the Gmail connection at Google. Nothing was deleted. Try again, or disconnect Gmail from your Google account first.",
  delete_storage:
    "Could not delete your uploaded files. Nothing else was deleted. Try again.",
  delete_auth_user:
    "Your Gmail grant and files were removed, but the account itself could not be deleted. Try again."
};

export async function POST(request: Request) {
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

  // A8: the target is the session user and nothing else. This route reads no
  // identifier from the body, the query string, a route param or a header. An
  // endpoint that accepts a target user id is an account-deletion oracle for
  // every account in the system.
  const userId = user.id;

  let body: DeleteBody;

  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.confirmation !== DELETE_CONFIRMATION) {
    return NextResponse.json(
      { error: `Type ${DELETE_CONFIRMATION} to confirm.` },
      { status: 400 }
    );
  }

  // The admin client is confined to the two operations no user-scoped client
  // can perform: deleting the caller own auth user, and clearing the objects
  // under their own {user_id}/ prefix. Every read below stays user-scoped.
  const admin = createAdminSupabaseClient();

  const result = await deleteAccount({
    revokeGmailGrant: async () => {
      const connection = await getGmailConnection(supabase, userId);

      if (!connection) {
        return;
      }

      await revokeToken(decryptSecret(connection.refresh_token_encrypted));
    },
    deleteStorageObjects: () => deleteStoragePrefix(admin, userId),
    deleteAuthUser: async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);

      if (error) {
        throw new Error(error.message);
      }
    }
  });

  if (!result.ok) {
    reportError("api.account.delete.failed", new Error(result.failedStep ?? "unknown"), {
      userId,
      failedStep: result.failedStep,
      completed: result.completed
    });

    return NextResponse.json(
      {
        error:
          STEP_MESSAGES[result.failedStep ?? ""] ??
          "Account deletion failed. Nothing was deleted.",
        failedStep: result.failedStep
      },
      { status: 500 }
    );
  }

  try {
    await supabase.auth.signOut();
  } catch (error) {
    // The account is already gone; a failed cookie clear must not report failure.
    reportError("api.account.delete.signout_failed", error, { userId });
  }

  return NextResponse.json({ deleted: true, objectsDeleted: result.objectsDeleted ?? 0 });
}
