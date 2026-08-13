export interface MimeMessageInput {
  to: string;
  subject?: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

const MAX_SUBJECT_LENGTH = 998;
const MAX_RECIPIENTS = 100;

const ADDR_SPEC_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

// Narrow, deliberate address parser: splits on commas outside quoted strings
// and angle brackets (display names may contain commas), then validates each
// addr-spec. Only bare addresses are emitted — display names are dropped so no
// unvalidated text ever reaches a MIME header.
export function parseRecipients(raw: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;

  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "<" && !inQuotes) inAngle = true;
    else if (ch === ">" && !inQuotes) inAngle = false;

    if (ch === "," && !inQuotes && !inAngle) {
      entries.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  entries.push(current);

  const addresses = entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const angleMatch = entry.match(/<([^<>]*)>\s*$/);
      const address = (angleMatch ? angleMatch[1] : entry).trim();
      if (!ADDR_SPEC_PATTERN.test(address)) {
        throw new Error(`"${address || entry}" isn't a valid email address.`);
      }
      return address;
    });

  if (addresses.length === 0) {
    throw new Error("Add at least one recipient email address.");
  }
  if (addresses.length > MAX_RECIPIENTS) {
    throw new Error(`Too many recipients (max ${MAX_RECIPIENTS}).`);
  }
  return addresses;
}

function assertHeaderSafe(value: string, fieldLabel: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${fieldLabel} can't contain line breaks.`);
  }
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) {
    return subject;
  }
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Plain-text only in V1 — no HTML option. Every header value is validated
// before it's concatenated; the body may contain line breaks freely.
export function buildMimeMessage(input: MimeMessageInput): string {
  const recipients = parseRecipients(input.to);

  const subject = input.subject?.trim() ?? "";
  assertHeaderSafe(subject, "The subject");
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(`The subject is too long (max ${MAX_SUBJECT_LENGTH} characters).`);
  }

  const lines: string[] = [`To: ${recipients.join(", ")}`];
  if (subject) {
    lines.push(`Subject: ${encodeSubject(subject)}`);
  }
  if (input.inReplyTo) {
    assertHeaderSafe(input.inReplyTo, "The reply reference");
    lines.push(`In-Reply-To: ${input.inReplyTo}`);
  }
  if (input.references) {
    assertHeaderSafe(input.references, "The reply reference");
    lines.push(`References: ${input.references}`);
  }
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("MIME-Version: 1.0");
  lines.push("");
  lines.push(Buffer.from(input.body, "utf8").toString("base64"));

  return toBase64Url(lines.join("\r\n"));
}
