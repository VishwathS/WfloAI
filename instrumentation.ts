import { assertServerEnv } from "@/lib/config/env";
import { reportError } from "@/lib/observability/report";

// Runs once when a server instance boots. A10: a production deployment missing
// a required server-side variable must refuse to start rather than run
// degraded. The signing key is the reason this exists — its absence makes
// /api/inngest accept unsigned requests into the service-role execution path,
// and nothing looks broken.
//
// Skipped during `next build`: the build has no reason to hold production
// secrets, and failing there would say nothing about the deployed environment.
export function register(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  try {
    assertServerEnv();
  } catch (error) {
    // Next logs a failed instrumentation hook and then leaves the process
    // running in a half-prepared state — it reports "Ready" and serves nothing.
    // That is still silence by the standard A10 cares about, so the exit is
    // explicit: the host must see a failed boot, not a live instance that
    // cannot work.
    reportError("startup.required_env_missing", error);

    if (process.env.NEXT_RUNTIME === "nodejs") {
      process.exit(1);
    }

    throw error;
  }
}
