import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requiresAuth } from "@/lib/security/publicPaths";

// A3. Admission is a single flag, profiles.approved, written only by
// redeem_invite_code (security definer) or by the operator. Nothing here can
// set it.

export const WAITLIST_PATH = "/waitlist";

// Pages an authenticated-but-unapproved user may still reach.
//
//   /waitlist  without it the gate redirects /waitlist to /waitlist forever.
//   /settings  the privacy policy tells every user they can export their data
//              and delete their account from Settings. The routes behind it
//              (POST /api/account/delete, GET /api/account/export) are
//              deliberately not approval-gated, so gating the only page that
//              reaches them made a published promise unkeepable.
//
// Neither grants any dashboard, canvas or execution capability: /dashboard and
// /workflows/:id stay gated here, and every money-spending route checks
// requireApprovedUser itself.
const UNAPPROVED_PAGES = new Set([WAITLIST_PATH, "/settings"]);

// Layered on top of task 01 allow-list rather than beside it: a page that does
// not need a session does not need approval either, so the two checks compose
// instead of competing.
export function requiresApproval(pathname: string): boolean {
  if (!requiresAuth(pathname)) {
    return false;
  }

  return !UNAPPROVED_PAGES.has(pathname);
}

// The API routes that spend the operator money. A gate that only covers pages
// is not a cost control, so each of these carries the check in its own handler:
// the proxy deliberately does not gate /api/, and these routes are reachable
// directly. tests/approvalGate.test.ts asserts each one still calls the guard.
export const MONEY_SPENDING_ROUTES = [
  "app/api/execute/route.ts",
  "app/api/lookup/route.ts",
  "app/api/workflows/[id]/execute/route.ts",
  "app/api/workflows/[id]/schedules/[scheduleId]/run/route.ts"
] as const;

// Fails closed. A missing row, an RLS denial and a transport error are all
// "not approved" — the gate must not open because a query failed.
export async function isApprovedUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("approved")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return (data as { approved: boolean }).approved === true;
}

export async function requireApprovedUser(
  supabase: SupabaseClient,
  userId: string
): Promise<NextResponse | null> {
  if (await isApprovedUser(supabase, userId)) {
    return null;
  }

  return NextResponse.json(
    { error: "This account has not been approved. Redeem an invite code to get access." },
    { status: 403 }
  );
}
