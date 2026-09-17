// A10 / B5 / B9. A missing signing key currently produces silence; this makes
// it produce a refusal to start.
//
// The list is every server-side variable the application cannot function
// correctly without in production. Variables with a safe default are
// deliberately absent: GMAIL_READ_ACTIONS_ENABLED defaults to off, and the
// task 02 reporter DSN is optional until a vendor is chosen.

export interface RequiredVariable {
  name: string;
  why: string;
}

export const REQUIRED_SERVER_ENV: readonly RequiredVariable[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", why: "every Supabase client" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", why: "every Supabase client" },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    why: "the Inngest execution path and account deletion"
  },
  { name: "ANTHROPIC_API_KEY", why: "AI and Router nodes" },
  { name: "TAVILY_API_KEY", why: "Lookup nodes" },
  {
    name: "INTEGRATION_TOKEN_KEY",
    why: "decrypting stored Gmail tokens and credentials — see docs/KEY-RECOVERY.md"
  },
  { name: "GOOGLE_CLIENT_ID", why: "the Gmail OAuth client" },
  { name: "GOOGLE_CLIENT_SECRET", why: "the Gmail OAuth client" },
  {
    name: "INNGEST_EVENT_KEY",
    why: "publishing workflow/schedule.due — without it schedules never fire"
  },
  {
    name: "INNGEST_SIGNING_KEY",
    why: "authenticating /api/inngest — without it the endpoint accepts unsigned requests into the service-role execution path"
  }
] as const;

export function missingServerEnv(env: Record<string, string | undefined>): string[] {
  return REQUIRED_SERVER_ENV.filter(({ name }) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  }).map(({ name }) => name);
}

export function describeMissingServerEnv(missing: readonly string[]): string {
  const byName = new Map(REQUIRED_SERVER_ENV.map((entry) => [entry.name, entry.why]));
  const lines = missing.map((name) => `  - ${name} (${byName.get(name) ?? "required"})`);

  return [
    `Refusing to start: ${missing.length} required environment variable${
      missing.length === 1 ? " is" : "s are"
    } missing.`,
    ...lines,
    "See .env.local.example and the Production environment section of README.md."
  ].join("\n");
}

// Throws in production only. Development runs against .env.local with whatever
// subset the developer needs, and a hard failure there would make the app
// unusable for anyone working on a single feature.
export function assertServerEnv(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const missing = missingServerEnv(env);

  if (missing.length > 0) {
    throw new Error(describeMissingServerEnv(missing));
  }
}
