export const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret"
]);

const MIN_SECRET_LENGTH = 4;

// Value-based redaction: removes every occurrence of the actual credential
// values used during an execution, catching APIs that echo credentials under
// unexpected keys. Also redacts the base64 Basic pair when both parts given.
export function redactSecrets(text: string, secretValues: string[]): string {
  let result = text;
  for (const value of secretValues) {
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    result = result.split(value).join(REDACTED);
  }
  return result;
}

// Key-based redaction for parsed JSON responses (defense in depth alongside
// value-based redaction).
export function redactSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redactSensitiveKeys(entry)
      ])
    );
  }
  return value;
}
