import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/security/redirect";
import { NextResponse } from "next/server";

function loginRedirect(origin: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth");
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const safeNext = safeRedirectPath(requestUrl.searchParams.get("next"));

  // A5: a callback without a code never established a session, and a failed
  // exchange must not redirect as though it succeeded.
  if (!code) {
    return loginRedirect(requestUrl.origin);
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return loginRedirect(requestUrl.origin);
  }

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
}
