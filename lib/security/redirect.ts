// Task 07 moved the authenticated dashboard to /dashboard so that / can be the
// public marketing page. An unusable or missing `next` lands on the dashboard,
// not on the marketing page.
const DEFAULT_PATH = "/dashboard";

// A5: a post-authentication redirect target must be a same-origin *path*.
// `next.startsWith("/")` is not sufficient — `//evil.com` and `/\evil.com` both
// resolve to another origin, because the WHATWG URL parser treats `\` as `/`
// for http(s) and reads a leading `//` as an authority. Both are phishing
// primitives once the user is already signed in.
export function safeRedirectPath(next: string | null | undefined): string {
  if (typeof next !== "string") {
    return DEFAULT_PATH;
  }

  // The URL parser strips tab/newline/CR before parsing, so strip them first:
  // otherwise "/\n/evil.com" passes the checks below and still resolves away.
  const cleaned = next.replace(/[\t\n\r]/g, "");

  if (!cleaned.startsWith("/")) {
    return DEFAULT_PATH;
  }

  if (cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
    return DEFAULT_PATH;
  }

  return cleaned;
}
