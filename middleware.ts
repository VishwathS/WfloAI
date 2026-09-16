import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/server";

// A4: allow-list, not deny-list. The previous deny-list left /settings — the
// page that manages OAuth tokens and API keys — ungated, and every new
// dashboard route would have inherited that default.
//
// Task 07 adds the marketing homepage and /privacy, /terms to these lists.
const PUBLIC_PATHS = new Set(["/login"]);
const PUBLIC_PREFIXES = ["/auth/"];

function requiresAuth(pathname: string) {
  // API routes are not gated here. Each app/api route calls auth.getUser() and
  // returns 401 JSON itself; gating them would turn those 401s into HTML
  // redirects. /api/inngest in particular has no user session at all — its auth
  // is INNGEST_SIGNING_KEY signature verification.
  if (pathname.startsWith("/api/")) {
    return false;
  }

  // Framework-internal assets and RSC/HMR endpoints. Protected pages are still
  // gated at their own path.
  if (pathname.startsWith("/_next/")) {
    return false;
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return false;
  }

  return !PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
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
    dashboardUrl.pathname = "/";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
