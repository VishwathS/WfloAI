import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { checkDueSchedules, runScheduledWorkflow } from "@/lib/inngest/functions";

// Inngest's signed webhook endpoint — request auth is signature verification
// via INNGEST_SIGNING_KEY in production, not Supabase cookie sessions.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [checkDueSchedules, runScheduledWorkflow]
});
