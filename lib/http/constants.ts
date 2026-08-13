// Transport-level headers users must never control directly (neither via the
// Headers rows nor an api_key credential's headerName — Authorization excepted
// for api_key, which may legitimately target it).
export const BLOCKED_REQUEST_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "cookie"
]);

export const HTTP_LIMITS = {
  MAX_URL_LENGTH: 2048,
  MAX_HEADERS: 32,
  MAX_HEADER_VALUE_LENGTH: 4096,
  MAX_BODY_BYTES: 262_144, // 256 KB
  MAX_RESPONSE_BYTES: 512_000, // ~500 KB, enforced while streaming
  MAX_REDIRECTS: 3,
  CONNECT_TIMEOUT_MS: 10_000,
  TOTAL_TIMEOUT_MS: 30_000
} as const;

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidHeaderName(name: string): boolean {
  return HEADER_NAME_PATTERN.test(name);
}

export function isBlockedHeader(name: string): boolean {
  return BLOCKED_REQUEST_HEADERS.has(name.toLowerCase());
}

// api_key credentials may target Authorization; everything else on the blocked
// list stays off-limits.
export function isAllowedApiKeyHeader(name: string): boolean {
  if (!isValidHeaderName(name)) return false;
  const lower = name.toLowerCase();
  return lower === "authorization" || !BLOCKED_REQUEST_HEADERS.has(lower);
}
