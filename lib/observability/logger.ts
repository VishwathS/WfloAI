import { redactSensitiveKeys } from "@/lib/integrations/redact";

export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

// Stable, greppable event names. Operational alerting filters on these, so
// treat them as an interface: add freely, rename deliberately.
export const LOG_EVENTS = {
  scheduledRunFailed: "scheduled_run.failed",
  gmailSendFailed: "gmail.send.failed",
  httpMutationFailed: "http.mutation.failed"
} as const;

// The single sanctioned console sink in the application. Everything else goes
// through log()/reportError() so redaction cannot be forgotten at a call site.
//
// One line of JSON per event: greppable by `event`, filterable by `level`, and
// parseable by whatever the host forwards stdout/stderr to.
export function log(level: LogLevel, event: string, context: LogContext = {}): void {
  const line = safeStringify(level, event, context);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

// Redaction walks the context recursively, so circular or pathological input
// can throw (or blow the stack) before anything is serialized. If that happens
// the context is dropped entirely rather than logged unredacted: a log line is
// never worth leaking a credential, and the logger must never throw into the
// request it is reporting on.
function safeStringify(level: LogLevel, event: string, context: LogContext): string {
  const base = { level, event, ts: new Date().toISOString() };

  try {
    return JSON.stringify({ ...base, ...(redactSensitiveKeys(context) as LogContext) });
  } catch {
    try {
      return JSON.stringify({ ...base, contextDropped: "unserializable" });
    } catch {
      return '{"level":"error","event":"logger.serialize_failed"}';
    }
  }
}
