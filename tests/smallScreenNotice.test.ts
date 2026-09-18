import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SMALL_SCREEN_NOTICE, SmallScreenNotice } from "@/components/ui/small-screen-notice";

// Task 16 C1: the canvas is not built for phones, so small screens get an honest
// notice instead of a silently broken canvas.

describe("the small-screen notice", () => {
  test("uses the approved wording", () => {
    expect(SMALL_SCREEN_NOTICE).toBe("WfloAI works best on desktop.");
  });

  test("renders the wording as a note that hides at desktop width", () => {
    const html = renderToStaticMarkup(createElement(SmallScreenNotice));

    expect(html).toContain(SMALL_SCREEN_NOTICE);
    expect(html).toContain('role="note"');
    expect(html).toMatch(/class="[^"]*\blg:hidden\b/);
  });

  test("is rendered by the signed-in layout that wraps dashboard, settings and the canvas", () => {
    const layout = readFileSync(join(process.cwd(), "app/(dashboard)/layout.tsx"), "utf8");

    expect(layout).toContain('import { SmallScreenNotice } from "@/components/ui/small-screen-notice"');
    expect(layout).toContain("<SmallScreenNotice />");
  });
});
