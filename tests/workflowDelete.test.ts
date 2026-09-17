import { beforeEach, describe, expect, test, vi } from "vitest";

// S3. Deleting a workflow cascades workflow_files rows but not the uploaded
// bytes, so deletion moved server-side where authorisation, the row delete and
// the storage sweep can be ordered deliberately. These are route-level tests
// with a faked Supabase client — the ordering is the whole point of the change,
// and asserting it from source would not catch a reordering that still compiles.

const state = {
  user: { id: "user-1" } as { id: string } | null,
  workflow: { id: "wf-1", user_id: "user-1" } as { id: string; user_id: string } | null,
  lookupError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  listError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  tree: {} as Record<string, { name: string; id: string | null }[]>,
  calls: [] as string[],
  removed: [] as string[]
};

function reset() {
  state.user = { id: "user-1" };
  state.workflow = { id: "wf-1", user_id: "user-1" };
  state.lookupError = null;
  state.deleteError = null;
  state.listError = null;
  state.removeError = null;
  state.tree = {};
  state.calls = [];
  state.removed = [];
}

function fakeClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } })
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.calls.push(`select:${table}`);
            return { data: state.workflow, error: state.lookupError };
          }
        })
      }),
      delete: () => {
        const chain = {
          eq: () => chain,
          then: (resolve: (value: { error: unknown }) => unknown) => {
            state.calls.push(`delete:${table}`);
            return Promise.resolve(resolve({ error: state.deleteError }));
          }
        };
        return chain;
      }
    }),
    storage: {
      from: () => ({
        list: async (prefix: string) => {
          state.calls.push(`list:${prefix}`);
          if (state.listError) return { data: null, error: state.listError };
          return { data: state.tree[prefix] ?? [], error: null };
        },
        remove: async (paths: string[]) => {
          state.calls.push("remove");
          if (state.removeError) return { data: null, error: state.removeError };
          state.removed.push(...paths);
          return { data: null, error: null };
        }
      })
    }
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => fakeClient(),
  updateSession: () => ({ supabase: fakeClient(), response: null })
}));

const { DELETE } = await import("@/app/api/workflows/[id]/route");

function request(origin = "https://app.test"): Request {
  return new Request("https://app.test/api/workflows/wf-1", {
    method: "DELETE",
    headers: { origin }
  });
}

const context = { params: Promise.resolve({ id: "wf-1" }) };

beforeEach(reset);

describe("authorisation", () => {
  test("an authorised owner deletes the workflow", async () => {
    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(state.calls).toContain("delete:workflows");
  });

  test("an unauthenticated caller gets 401 and nothing is deleted", async () => {
    state.user = null;

    const response = await DELETE(request(), context);

    expect(response.status).toBe(401);
    expect(state.calls).not.toContain("delete:workflows");
    expect(state.removed).toEqual([]);
  });

  test("a caller who does not own the workflow gets 403 and nothing is deleted", async () => {
    state.workflow = { id: "wf-1", user_id: "someone-else" };

    const response = await DELETE(request(), context);

    expect(response.status).toBe(403);
    expect(state.calls).not.toContain("delete:workflows");
    expect(state.removed).toEqual([]);
  });

  test("a missing workflow is 404, not a silent success", async () => {
    state.workflow = null;

    const response = await DELETE(request(), context);

    expect(response.status).toBe(404);
    expect(state.calls).not.toContain("delete:workflows");
  });

  test("a cross-origin request is refused before anything is read", async () => {
    const response = await DELETE(request("https://evil.test"), context);

    expect(response.status).toBe(403);
    expect(state.calls).toEqual([]);
  });
});

describe("storage cleanup", () => {
  test("a workflow with no files deletes cleanly and removes nothing", async () => {
    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ objectsDeleted: 0 });
    expect(state.removed).toEqual([]);
    expect(state.calls).toContain("delete:workflows");
  });

  test("a workflow with uploaded files removes exactly its own prefix", async () => {
    state.tree = {
      "user-1/wf-1": [
        { name: "file-a", id: "o1" },
        { name: "file-b", id: "o2" }
      ]
    };

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ objectsDeleted: 2 });
    expect(state.removed.sort()).toEqual(["user-1/wf-1/file-a", "user-1/wf-1/file-b"]);
    // Scoped to this workflow, not the whole account.
    expect(state.calls).toContain("list:user-1/wf-1");
  });

  test("storage is swept BEFORE the row is deleted", async () => {
    state.tree = { "user-1/wf-1": [{ name: "file-a", id: "o1" }] };

    await DELETE(request(), context);

    expect(state.calls.indexOf("remove")).toBeLessThan(state.calls.indexOf("delete:workflows"));
  });

  test("a storage failure deletes nothing and does not report success", async () => {
    // The ordering exists for this case: a row deleted first would leave the
    // bytes with nothing left to find them by, while telling the user the
    // workflow is gone.
    state.listError = { message: "storage unavailable" };

    const response = await DELETE(request(), context);

    expect(response.status).toBe(500);
    expect(state.calls).not.toContain("delete:workflows");
    expect(state.removed).toEqual([]);
  });

  test("a failure removing objects also aborts before the row delete", async () => {
    state.tree = { "user-1/wf-1": [{ name: "file-a", id: "o1" }] };
    state.removeError = { message: "denied" };

    const response = await DELETE(request(), context);

    expect(response.status).toBe(500);
    expect(state.calls).not.toContain("delete:workflows");
  });
});

describe("database failure", () => {
  test("a row-delete failure is reported rather than silently swallowed", async () => {
    state.tree = { "user-1/wf-1": [{ name: "file-a", id: "o1" }] };
    state.deleteError = { message: "constraint" };

    const response = await DELETE(request(), context);

    expect(response.status).toBe(500);
    // The files are already gone, which is visible and recoverable: retrying
    // the same delete sweeps an empty prefix and removes the row.
    expect(state.removed).toEqual(["user-1/wf-1/file-a"]);
  });
});
