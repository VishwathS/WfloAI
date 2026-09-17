import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETION_ORDER, deleteAccount, deleteStoragePrefix } from "@/lib/account/deleteAccount";

// A8. The ordering and the abort semantics are the whole point of this module,
// so they are tested as behaviour with injected steps rather than inferred from
// the route. The end-to-end checks the task also asks for (nine tables empty,
// storage prefix empty, Google grant gone) need a dedicated test account and a
// live environment, and are recorded as outstanding in the task file.

function trackingSteps(overrides: Partial<Record<string, () => Promise<unknown>>> = {}) {
  const calls: string[] = [];
  const steps = {
    revokeGmailGrant: vi.fn(async () => {
      calls.push("revoke_gmail");
      if (overrides.revokeGmailGrant) await overrides.revokeGmailGrant();
    }),
    deleteStorageObjects: vi.fn(async () => {
      calls.push("delete_storage");
      if (overrides.deleteStorageObjects) await overrides.deleteStorageObjects();
      return 3;
    }),
    deleteAuthUser: vi.fn(async () => {
      calls.push("delete_auth_user");
      if (overrides.deleteAuthUser) await overrides.deleteAuthUser();
    })
  };
  return { calls, steps };
}

describe("deletion ordering", () => {
  test("revokes at Google, then clears storage, then deletes the auth user", async () => {
    const { calls, steps } = trackingSteps();

    const result = await deleteAccount(steps);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["revoke_gmail", "delete_storage", "delete_auth_user"]);
  });

  test("the declared order is the order that runs", () => {
    expect([...DELETION_ORDER]).toEqual(["revoke_gmail", "delete_storage", "delete_auth_user"]);
  });

  test("reports how many stored objects were removed", async () => {
    const { steps } = trackingSteps();
    await expect(deleteAccount(steps)).resolves.toMatchObject({ objectsDeleted: 3 });
  });
});

describe("partial failure aborts rather than continuing", () => {
  test("a revocation failure deletes nothing at all", async () => {
    // Falling through here would strand the OAuth grant in the user's Google
    // account with no token left to revoke it with - the worst outcome in A8,
    // because the user believes access was removed and Google disagrees.
    const { steps } = trackingSteps({
      revokeGmailGrant: async () => {
        throw new Error("google said no");
      }
    });

    const result = await deleteAccount(steps);

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("revoke_gmail");
    expect(result.completed).toEqual([]);
    expect(steps.deleteStorageObjects).not.toHaveBeenCalled();
    expect(steps.deleteAuthUser).not.toHaveBeenCalled();
  });

  test("a storage failure stops before the auth user is deleted", async () => {
    const { steps } = trackingSteps({
      deleteStorageObjects: async () => {
        throw new Error("bucket unavailable");
      }
    });

    const result = await deleteAccount(steps);

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("delete_storage");
    expect(result.completed).toEqual(["revoke_gmail"]);
    expect(steps.deleteAuthUser).not.toHaveBeenCalled();
  });

  test("a failure at the last step is still reported as a failure", async () => {
    const { steps } = trackingSteps({
      deleteAuthUser: async () => {
        throw new Error("admin api down");
      }
    });

    const result = await deleteAccount(steps);

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("delete_auth_user");
    expect(result.completed).toEqual(["revoke_gmail", "delete_storage"]);
  });
});

type StorageEntry = { name: string; id: string | null };

function fakeStorage(tree: Record<string, StorageEntry[]>, removed: string[]) {
  return {
    storage: {
      from: () => ({
        list: async (prefix: string) => ({ data: tree[prefix] ?? [], error: null }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { data: null, error: null };
        }
      })
    }
  } as unknown as SupabaseClient;
}

describe("storage prefix deletion", () => {
  test("walks nested folders and removes every object under the user prefix", async () => {
    const removed: string[] = [];
    const client = fakeStorage(
      {
        "u1": [{ name: "wf-a", id: null }, { name: "wf-b", id: null }],
        "u1/wf-a": [{ name: "file-1", id: "o1" }, { name: "file-2", id: "o2" }],
        "u1/wf-b": [{ name: "file-3", id: "o3" }]
      },
      removed
    );

    const count = await deleteStoragePrefix(client, "u1");

    expect(count).toBe(3);
    expect(removed.sort()).toEqual(["u1/wf-a/file-1", "u1/wf-a/file-2", "u1/wf-b/file-3"]);
  });

  test("an empty prefix removes nothing and reports zero", async () => {
    const removed: string[] = [];
    const count = await deleteStoragePrefix(fakeStorage({ u1: [] }, removed), "u1");

    expect(count).toBe(0);
    expect(removed).toEqual([]);
  });

  test("a listing error throws rather than reporting a partial success", async () => {
    // A partial storage deletion that reports success is worse than a clear
    // failure - it is an explicit Stop Condition for this task.
    const client = {
      storage: {
        from: () => ({
          list: async () => ({ data: null, error: { message: "denied" } }),
          remove: async () => ({ data: null, error: null })
        })
      }
    } as unknown as SupabaseClient;

    await expect(deleteStoragePrefix(client, "u1")).rejects.toThrow(/denied/);
  });
});

describe("the deletion endpoint cannot be aimed at another account", () => {
  const source = readFileSync(
    new URL("../app/api/account/delete/route.ts", import.meta.url),
    "utf8"
  );

  test("the target id comes from the session user", () => {
    expect(source).toContain("const userId = user.id;");
  });

  test("no identifier is read from the request", () => {
    // An endpoint that accepts a target user id is an account-deletion oracle
    // for every account in the system. The behavioural version of this check
    // (call as A naming B, assert B survives) needs two live accounts and is
    // recorded as outstanding; this pins the property that makes it true.
    for (const forbidden of [
      "body.userId",
      "body.user_id",
      "params.userId",
      "searchParams.get",
      "headers.get(\"x-user-id\")"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("the admin client is used only for the two operations that require it", () => {
    expect(source).toContain("admin.auth.admin.deleteUser(userId)");
    expect(source).toContain("deleteStoragePrefix(admin, userId)");
    // Every other read stays user-scoped: the Gmail connection is loaded with
    // the request-scoped client, where RLS still applies.
    expect(source).toContain("getGmailConnection(supabase, userId)");
    expect(source).not.toContain("admin.from(");
  });

  test("a typed confirmation is required", () => {
    expect(source).toContain("DELETE MY ACCOUNT");
    expect(source).toContain("body.confirmation !== DELETE_CONFIRMATION");
  });
});
