import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import type { LogContext } from "@/lib/observability/logger";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

// Postgres error text names tables, columns, constraints and RLS policies.
// That detail belongs with the operator, not in a response body — so the full
// error goes to the reporter and the client gets a generic message.
export function apiError(
  event: string,
  error: unknown,
  context: LogContext = {},
  status = 500
): NextResponse {
  reportError(event, error, context);
  return NextResponse.json({ error: GENERIC_MESSAGE }, { status });
}
