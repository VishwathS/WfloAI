import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SUPPORT_EMAIL } from "@/lib/support";

// Task 07 manual step 6, Task 13 runbook §2.1, Task 17 gate 15: one monitored
// support address, the same in the privacy policy, the terms, /help and the
// runbook. One constant is how the four stay the same.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const PAGES = [
  "app/(marketing)/privacy/page.tsx",
  "app/(marketing)/terms/page.tsx",
  "app/(marketing)/help/page.tsx"
];

describe("the support address", () => {
  test("is the operator-approved address", () => {
    expect(SUPPORT_EMAIL).toBe("vishwath@ucsb.edu");
  });

  test.each(PAGES)("%s renders it from the shared constant, with no placeholder left", (page) => {
    const source = read(page);

    expect(source).toContain('import { SUPPORT_EMAIL } from "@/lib/support"');
    expect(source).toContain("mailto:${SUPPORT_EMAIL}");
    expect(source).not.toMatch(/OPERATOR TO SUPPLY/);
    expect(source).not.toContain(SUPPORT_EMAIL);
  });

  test("the runbook names the same address", () => {
    expect(read("docs/RUNBOOK.md")).toContain(SUPPORT_EMAIL);
    expect(read("docs/RUNBOOK.md")).not.toContain("<SUPPORT_ADDRESS>");
  });

  test("both legal pages still carry the DRAFT banner", () => {
    for (const page of PAGES.slice(0, 2)) {
      expect(read(page)).toContain("<DraftBanner");
    }
  });
});

describe("the privacy draft describes what Gmail connect actually requests", () => {
  test("it discloses the identity scopes alongside gmail.send, and no longer claims one permission", () => {
    const privacy = read("app/(marketing)/privacy/page.tsx");

    expect(privacy).not.toMatch(/requests one\s+permission/);
    expect(privacy).toContain("gmail.send");
    expect(privacy).toContain("openid");
    expect(privacy).toMatch(/email<\/span>/);
  });
});
