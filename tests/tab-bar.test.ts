import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The tab bar's slots share the width by `flex-grow`, and a tab change
 * transitions the grow value so the pill slides. Layout is not measurable
 * without a browser, so this pins what decides it: every slot carries the
 * same classes apart from its grow value, and only the active slot has the
 * larger one.
 */

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

const { TabBar } = await import("@/components/tab-bar");

function slots(pathname: string) {
  path.current = pathname;
  const html = renderToStaticMarkup(createElement(TabBar));
  return [...html.matchAll(/<a [^>]*data-tab-slot=""[^>]*>/g)].map((m) => {
    const cls = (/class="([^"]*)"/.exec(m[0])?.[1] ?? "").split(/\s+/);
    return {
      grow: cls.filter((c) => c === "grow" || c.startsWith("grow-")),
      rest: cls.filter((c) => c !== "grow" && !c.startsWith("grow-")).sort(),
      current: m[0].includes('aria-current="page"'),
    };
  });
}

describe("the tab bar", () => {
  it("gives the larger grow value to the active slot and to no other", () => {
    const baseline = slots("/");
    expect(baseline).toHaveLength(5);

    for (const [i, pathname] of ["/", "/discover", "/calendar", "/lists", "/badges"].entries()) {
      const now = slots(pathname);
      expect(now.map((s) => s.current)).toEqual([0, 1, 2, 3, 4].map((n) => n === i));
      expect(now.map((s) => s.grow)).toEqual([0, 1, 2, 3, 4].map((n) => (n === i ? ["grow-[2.4]"] : ["grow"])));
      // Everything else about a slot, the transition included, is the same whichever tab is active.
      expect(now.map((s) => s.rest)).toEqual(baseline.map((s) => s.rest));
      expect(now[0].rest).toContain("transition-[flex-grow]");
      expect(now[0].rest).toContain("basis-0");
      // On the motion tokens, not a number of its own (STYLE.md, Motion).
      expect(now[0].rest).toContain("duration-(--base)");
      expect(now[0].rest).toContain("ease-out");
      expect(now[0].rest).toContain("motion-reduce:transition-none");
    }
  });
});
