import type { GmailNodeMetadata } from "@/lib/integrations/types";

export interface UpstreamEmailRef {
  messageId: string;
  threadId: string;
}

export interface ParentNodeMetadata {
  nodeId: string;
  metadata?: Record<string, unknown>;
}

function gmailMetadataOf(parent: ParentNodeMetadata): GmailNodeMetadata["gmail"] | undefined {
  return (parent.metadata as GmailNodeMetadata | undefined)?.gmail;
}

// Typed-metadata inference only — the target email is never inferred by
// scanning output text, and ambiguity fails before any external action.
export function findUpstreamEmailRef(
  parents: ParentNodeMetadata[],
  action: "Read Email" | "Reply to Email"
): UpstreamEmailRef {
  const gmailParents = parents.filter((parent) => gmailMetadataOf(parent));

  if (gmailParents.length === 0) {
    throw new Error(
      action === "Read Email"
        ? "Read Email needs a Gmail Find Emails (or Read Email) node connected before it."
        : "Reply to Email needs a Read Email node connected directly before it."
    );
  }

  if (gmailParents.length > 1) {
    throw new Error(`Connect exactly one Gmail node to ${action} — found ${gmailParents.length}.`);
  }

  const gmail = gmailMetadataOf(gmailParents[0])!;

  if (gmail.messageId && gmail.threadId) {
    return { messageId: gmail.messageId, threadId: gmail.threadId };
  }

  if (gmail.emails) {
    if (action === "Reply to Email") {
      // Replying to "the first of several found emails" is how you reply to
      // the wrong person. Reply only accepts a single-message (Read) source.
      throw new Error(
        "Reply to Email needs a Read Email node directly before it — add one between Find Emails and Reply."
      );
    }
    if (gmail.emails.length === 0) {
      throw new Error("No emails matched the previous step's search — nothing to read.");
    }
    return { messageId: gmail.emails[0].messageId, threadId: gmail.emails[0].threadId };
  }

  throw new Error(
    action === "Read Email"
      ? "Read Email couldn't find an email in the previous step."
      : "Reply to Email couldn't find an email in the previous step."
  );
}
