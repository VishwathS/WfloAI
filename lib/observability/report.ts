import { log, type LogContext } from "@/lib/observability/logger";
import { redactSensitiveKeys } from "@/lib/integrations/redact";

export interface ReportedError {
  event: string;
  message: string;
  name: string;
  stack?: string;
  context: LogContext;
}

type ErrorTransport = (reported: ReportedError) => void;

let transport: ErrorTransport | null = null;

// The single wiring point for an external error reporter (Sentry or
// equivalent). Choosing the vendor, creating the account and provisioning the
// DSN are operator actions — see task 02's Manual / External Steps — so nothing
// is registered here by default. Until one is registered, reportError() still
// produces a structured, greppable stderr line.
export function setErrorTransport(next: ErrorTransport | null): void {
  transport = next;
}

function describe(error: unknown): Pick<ReportedError, "message" | "name" | "stack"> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { message: String(error), name: "NonError" };
}

// Report an error to the operator. The full detail goes here; callers are
// responsible for returning a generic message to the user.
export function reportError(event: string, error: unknown, context: LogContext = {}): void {
  const described = describe(error);
  const safeContext = redactSensitiveKeys(context) as LogContext;

  log("error", event, { ...safeContext, error: described.message, errorName: described.name });

  if (!transport) {
    return;
  }

  try {
    transport({ event, ...described, context: safeContext });
  } catch {
    // A failing reporter must never take down the request it is reporting on.
    log("warn", "reporter.transport_failed", { originalEvent: event });
  }
}
