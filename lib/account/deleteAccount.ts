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
export async function deleteStoragePrefix(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const storage = admin.storage.from(STORAGE_BUCKET);
  const pending = [userId];
  const objectPaths: string[] = [];

  while (pending.length > 0) {
    const prefix = pending.pop() as string;
    let offset = 0;

    for (;;) {
      const { data, error } = await storage.list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset
      });

      if (error) {
        throw new Error(`Failed to list ${prefix}: ${error.message}`);
      }

      const entries = data ?? [];

      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
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
