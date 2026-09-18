import { createClient } from "@supabase/supabase-js";
import { serviceRoleKeyProblem } from "@/lib/config/env";

// Service-role client — bypasses RLS. Exactly two sanctioned consumers, and the
// list does not grow by precedent (see CLAUDE.md):
//
//   1. lib/inngest/functions.ts — background execution with no user session.
//   2. app/api/account/delete/route.ts — authenticated self-service account
//      deletion, which needs auth.admin.deleteUser() and the caller own storage
//      prefix. The target user id comes from auth.getUser() in that request and
//      never from client input; every other read there stays user-scoped.
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  const keyProblem = serviceRoleKeyProblem(serviceRoleKey);

  if (keyProblem) {
    throw new Error(keyProblem);
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
