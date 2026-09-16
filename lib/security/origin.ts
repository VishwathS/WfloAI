// B3: defense in depth behind Supabase's SameSite cookie defaults, which
// already block cross-site POSTs in current browsers. State-changing routes
// reject requests whose Origin is not this deployment's own origin.
//
// A missing Origin is rejected: browsers always send it on non-GET requests,
// and every caller of these routes is a same-origin browser fetch. This must
// not be applied to /api/inngest, which is a server-to-server signed webhook
// with no Origin header.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
