// A4 + A1. The authentication allow-list, extracted from proxy.ts so it can be
// unit-tested directly: task 07's public marketing pages and task 01's auth
// gate share one source of truth, and a collision between them is the failure
// this module exists to make visible.
//
// Allow-list, not deny-list. A deny-list left /settings — the page that manages
// OAuth tokens and API keys — ungated, and every new dashboard route would have
// inherited that default.
// /help is public on purpose: it is product documentation with no user data in
// it, and a support link that requires a login is no use to someone who cannot
// get in (B10).
const PUBLIC_PATHS = new Set(["/", "/login", "/privacy", "/terms", "/help"]);
const PUBLIC_PREFIXES = ["/auth/"];

export function requiresAuth(pathname: string): boolean {
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
