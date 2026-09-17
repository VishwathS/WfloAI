import type { SupabaseClient } from "@supabase/supabase-js";

// A8. The order below is load-bearing and is the reason this lives in its own
// module with injected steps: reversed, the Google grant is orphaned with no
// token left to revoke it with, and the storage objects are orphaned with no
// user_id context to find them by.
export const DELETION_ORDER = [
  "revoke_gmail",
  "delete_storage",
  "delete_auth_user"
] as const;

export type DeletionStep = (typeof DELETION_ORDER)[number];

export interface DeletionSteps {
  // No-op when the user has no Gmail connection. Must throw on a revocation
  // failure rather than swallowing it - see abortion semantics below.
  revokeGmailGrant: () => Promise<void>;
  deleteStorageObjects: () => Promise<number>;
  deleteAuthUser: () => Promise<void>;
}

export interface DeletionResult {
  ok: boolean;
  completed: DeletionStep[];
  failedStep?: DeletionStep;
  objectsDeleted?: number;
}

// Aborts at the first failure and reports which step failed. A revocation
// failure must not fall through to deleting the tokens: that strands the grant
// in the user Google account permanently, with the user believing it is gone.
export async function deleteAccount(steps: DeletionSteps): Promise<DeletionResult> {
  const completed: DeletionStep[] = [];
  let objectsDeleted: number | undefined;

  for (const step of DELETION_ORDER) {
    try {
      if (step === "revoke_gmail") {
        await steps.revokeGmailGrant();
      } else if (step === "delete_storage") {
        objectsDeleted = await steps.deleteStorageObjects();
      } else {
        await steps.deleteAuthUser();
      }
    } catch {
      return { ok: false, completed, failedStep: step, objectsDeleted };
    }

    completed.push(step);
  }

  return { ok: true, completed, objectsDeleted };
}

const STORAGE_BUCKET = "workflow-files";
const LIST_PAGE_SIZE = 100;

// Supabase storage list() is not recursive and objects live at
// {user_id}/{workflow_id}/{fileId}, so the prefix is walked a level at a time.
// A partial deletion that reports success is worse than a clear failure, so
// every error throws rather than being counted as progress.
//
// Takes any prefix: account deletion passes "{user_id}" and workflow deletion
// passes "{user_id}/{workflow_id}". One walker, so the two cannot drift.
// Storage RLS authorises on the first path segment, so a user-scoped client is
// sufficient for the workflow case and no admin client is involved there.
export async function deleteStoragePrefix(
  client: SupabaseClient,
  prefix: string
): Promise<number> {
  const storage = client.storage.from(STORAGE_BUCKET);
  const pending = [prefix];
  const objectPaths: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop() as string;
    let offset = 0;

    for (;;) {
      const { data, error } = await storage.list(current, {
        limit: LIST_PAGE_SIZE,
        offset
      });

      if (error) {
        throw new Error(`Failed to list ${current}: ${error.message}`);
      }

      const entries = data ?? [];

      for (const entry of entries) {
        const path = `${current}/${entry.name}`;
        // A folder placeholder has no id; a real object always has one.
        if (entry.id === null || entry.id === undefined) {
          pending.push(path);
        } else {
          objectPaths.push(path);
        }
      }

      if (entries.length < LIST_PAGE_SIZE) {
        break;
      }

      offset += entries.length;
    }
  }

  if (objectPaths.length === 0) {
    return 0;
  }

  const { error } = await storage.remove(objectPaths);

  if (error) {
    throw new Error(`Failed to remove objects: ${error.message}`);
  }

  return objectPaths.length;
}
