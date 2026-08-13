import type { SupabaseClient } from "@supabase/supabase-js";

// Threaded through executeWorkflow into integration nodes. Manual runs pass the
// user-scoped client; the Inngest path passes the admin client — every repo
// query filters by userId explicitly, which is the ownership guard when RLS is
// bypassed. runId is generated before execution starts (manual: fresh UUID
// reused for the workflow_runs insert; scheduled: derived from the Inngest
// event id so retries produce the same idempotency keys).
export interface IntegrationContext {
  supabase: SupabaseClient;
  userId: string;
  workflowId: string;
  runId: string;
  actionsUsed: { count: number };
}

export interface GmailEmailRef {
  messageId: string;
  threadId: string;
}

// Rides NodeExecutionResult.metadata, held in server memory only. Never
// rendered, never fed to AI prompts, never sent to the browser.
export interface GmailNodeMetadata {
  gmail?: {
    messageId?: string;
    threadId?: string;
    emails?: GmailEmailRef[];
  };
}

export interface BearerSecret {
  token: string;
}

export interface BasicSecret {
  username: string;
  password: string;
}

export interface ApiKeySecret {
  headerName: string;
  value: string;
}

export type CredentialSecret = BearerSecret | BasicSecret | ApiKeySecret;
