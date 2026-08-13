import { describe, expect, test } from "vitest";
import { buildMimeMessage, parseRecipients } from "@/lib/gmail/mime";

function decodeMime(raw: string): string {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

describe("parseRecipients", () => {
  test("parses bare and display-name addresses", () => {
    expect(parseRecipients("a@example.com")).toEqual(["a@example.com"]);
    expect(parseRecipients("Amazon <ship@amazon.com>")).toEqual(["ship@amazon.com"]);
  });

  test("handles commas inside quoted display names", () => {
    expect(parseRecipients('"Doe, Jane" <jane@example.com>, b@example.com')).toEqual([
      "jane@example.com",
      "b@example.com"
    ]);
  });

  test("rejects malformed addresses", () => {
    expect(() => parseRecipients("not-an-email")).toThrow();
    expect(() => parseRecipients("a@")).toThrow();
    expect(() => parseRecipients("")).toThrow();
  });
});

describe("buildMimeMessage header injection", () => {
  test("rejects CRLF in the To field", () => {
    expect(() =>
      buildMimeMessage({ to: "a@example.com\r\nBcc: victim@example.com", body: "hi" })
    ).toThrow();
  });

  test("rejects CRLF in the subject", () => {
    expect(() =>
      buildMimeMessage({
        to: "a@example.com",
        subject: "Hello\r\nX-Injected: 1",
        body: "hi"
      })
    ).toThrow("line breaks");
  });

  test("allows line breaks in the body", () => {
    const raw = buildMimeMessage({ to: "a@example.com", body: "line1\nline2" });
    expect(decodeMime(raw)).toContain("To: a@example.com");
  });

  test("subject is optional (Gmail allows subjectless mail)", () => {
    const decoded = decodeMime(buildMimeMessage({ to: "a@example.com", body: "hi" }));
    expect(decoded).not.toContain("Subject:");
  });

  test("encodes non-ASCII subjects via RFC 2047", () => {
    const decoded = decodeMime(
      buildMimeMessage({ to: "a@example.com", subject: "héllo", body: "hi" })
    );
    expect(decoded).toContain("Subject: =?UTF-8?B?");
  });

  test("drops display names from headers entirely", () => {
    const decoded = decodeMime(
      buildMimeMessage({ to: 'Evil "Name <a@example.com>', body: "hi" })
    );
    expect(decoded).toContain("To: a@example.com");
    expect(decoded).not.toContain("Evil");
  });
});
