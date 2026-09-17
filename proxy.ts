import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/server";
import { requiresAuth } from "@/lib/security/publicPaths";
import { isApprovedUser, requiresApproval, WAITLIST_PATH } from "@/lib/auth/approval";

export async function proxy(request: NextRequest) {
  const { supabase, response } = updateSession(request);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && requiresAuth(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  // A3: admission, layered on top of the auth check above rather than as a
  // second path list. Read live rather than from the session, so approving an
  // account takes effect on the next request without a re-login.
  if (user && requiresApproval(pathname)) {
    const approved = await isApprovedUser(supabase, user.id);

    if (!approved) {
      const waitlistUrl = request.nextUrl.clone();
      waitlistUrl.pathname = WAITLIST_PATH;
      waitlistUrl.search = "";
      return NextResponse.redirect(waitlistUrl);
    }
  }

  if (user && pathname === WAITLIST_PATH && (await isApprovedUser(supabase, user.id))) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
