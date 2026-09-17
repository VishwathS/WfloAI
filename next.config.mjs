// A6 (Phase 1): plain security headers. The full Content-Security-Policy is
// deliberately deferred to Phase 3 — it needs iteration against the React Flow
// canvas, and the non-nonce form is required so pages stay statically
// optimizable. `frame-ancestors` ships now because clickjacking protection does
// not depend on the rest of the policy.
//
// HSTS omits `preload` on purpose: submission to the preload list is effectively
// irreversible and is an operator decision, not a code one.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains"
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 15 promoted this out of `experimental`.
  serverExternalPackages: ["mammoth"],
  // Pin the workspace root so Turbopack does not infer it from a stray
  // lockfile in a parent directory outside this repository.
  turbopack: {
    root: import.meta.dirname
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
