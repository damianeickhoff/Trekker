import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BadgeState } from "@/lib/achievements";

/*
 * Motion round 2 and the badge card, pinned where a browser is not needed:
 * the phone header, the kept folds, first-view drawing, the badge row, the
 * heatmap's order, arrivals, and the classes the zoom and pills rely on.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const css = read("src/app/globals.css");

describe("the phone header", () => {
  it("puts the bell between search and the avatar on every tab page, and raises the wordmark", () => {
    const page = read("src/components/page.tsx");
    expect(page).toContain("<Wordmark size={28} />");
    expect(page).toMatch(/icon="search"[^\n]*\n\s*<PhoneAccount onHero=\{onHero\} \/>/);
    expect(page).toMatch(/<BellLink kind=\{onHero \? "glass" : "ghost"\} \/>\s*<AvatarMenu variant="phone" \/>/);
    for (const file of ["src/app/(app)/calendar/page.tsx", "src/app/(app)/lists/page.tsx", "src/components/discover/discover-page.tsx"]) {
      expect(read(file), file).toContain("<PhoneAccount");
      expect(read(file), file).not.toContain('<AvatarMenu variant="phone" />');
    }
    // The avatar's button is the same 40px box as the icon buttons beside it.
    expect(read("src/components/avatar-menu.tsx")).toMatch(/variant === "phone" \? "size-10"/);
  });
});

describe("folds that stay mounted", () => {
  it("draw open and shut by attribute, with the contents hidden once shut", async () => {
    const { Unfold } = await import("@/components/unfold");
    const open = renderToStaticMarkup(createElement(Unfold, { open: true, desk: true, id: "x" }, "rows"));
    expect(open).toBe('<div id="x" data-open="" data-desk="open" class="fold-panel"><div><div class="">rows</div></div></div>');
    const shut = renderToStaticMarkup(createElement(Unfold, { open: false }, "rows"));
    expect(shut).not.toContain("data-open");
    expect(css).toMatch(/\.fold-panel \{\s*display: grid;\s*grid-template-rows: 0fr;\s*visibility: hidden;/);
    expect(css).toMatch(/\.fold-panel\[data-open\] > \* \{[^}]*transition: opacity var\(--base\) var\(--ease-out\) 80ms;/);
  });

  it("turns every fold's chevron 180 degrees over --base", async () => {
    const { foldChevron } = await import("@/components/motion");
    expect(foldChevron(true)).toContain("-rotate-90");
    expect(foldChevron(false)).toContain("rotate-90");
    expect(foldChevron(true)).toContain("duration-(--base)");
    for (const file of [
      "src/components/home/challenge-strip.tsx",
      "src/components/home/waiting-fold.tsx",
      "src/components/settings/facts.tsx",
      "src/components/filter-controls.tsx",
      "src/components/badges/xp-panel.tsx",
    ]) {
      expect(read(file), file).toContain("foldChevron(");
    }
  });

  it("remembers Also waiting's fold per browser, and survives a storage that throws", () => {
    const fold = read("src/components/home/waiting-fold.tsx");
    expect(fold).toContain("localStorage.getItem(KEY)");
    expect(fold).toMatch(/try \{\s*return localStorage\.getItem\(KEY\) === "1";\s*\} catch \{\s*return false;/);
    expect(fold).toContain("<Unfold open={open} desk");
  });
});

describe("drawn on first view", () => {
  it("starts at nothing only where script runs and motion is welcome", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference) and (scripting: enabled)"));
    for (const part of ["draw-arc", "draw-fill", "draw-rise", "draw-grow", "draw-wipe", "draw-fade", "draw-cell"]) {
      expect(block, part).toContain(`.${part}`);
    }
    expect(block).toMatch(/\[data-draw\]:not\(\[data-seen\]\) \.draw-arc \{\s*stroke-dashoffset: var\(--arc\) !important;/);
  });

  it("spreads the heatmap's cells in reading order across 400ms", async () => {
    const { cellDelay } = await import("@/components/profile/parts");
    expect(cellDelay(0, 0, 26)).toBe(0);
    // Row by row: the second cell of the first row comes before the first cell of the second.
    expect(cellDelay(0, 1, 26)).toBeLessThan(cellDelay(1, 0, 26));
    // The last starts --fast before the end, so it has faded by 400ms.
    expect(cellDelay(6, 25, 26)).toBe(250);
  });
});

describe("the badge row", () => {
  const base: BadgeState = {
    id: "b",
    name: "Binge",
    icon: "tv",
    description: "Watch ten episodes in a day.",
    group: "Habits" as BadgeState["group"],
    tier: "silver",
    earned: false,
    earnedAt: null,
    percent: 30,
    sub: "3 of 10",
    toGo: "7 to go",
  };

  it("says how far in the badge's own terms and the percentage, or when it was earned", async () => {
    const { badgeLine } = await import("@/components/badges/row");
    expect(badgeLine(base)).toBe("3 of 10 · 30%");
    expect(badgeLine({ ...base, earned: true, sub: "Earned 5 Aug", percent: 100, toGo: null })).toBe("Earned 5 Aug");
    // A badge with nothing to count keeps its own line.
    expect(badgeLine({ ...base, sub: "Not yet", toGo: null })).toBe("Not yet");
    // A detail that names its subject first drops it: the description above already does.
    expect(badgeLine({ ...base, sub: "The Fast and the Furious · 9 of 10", percent: 90 })).toBe("9 of 10 · 90%");
  });

  it("is a row with the description in full, no tooltip and no bar, and the ring gone once earned", async () => {
    const { BadgeRow } = await import("@/components/badges/row");
    const html = renderToStaticMarkup(createElement(BadgeRow, { badge: base, onOpen: () => undefined }));
    expect(html).toContain("Watch ten episodes in a day.");
    expect(html).toContain("3 of 10 · 30%");
    expect(html).not.toContain("title=");
    expect(html).toContain("draw-arc");
    expect(html).toContain("data-draw");
    const earned = renderToStaticMarkup(createElement(BadgeRow, { badge: { ...base, earned: true, percent: 100, sub: "Earned 5 Aug", toGo: null }, onOpen: () => undefined }));
    expect(earned).not.toContain("stroke-surface-2");
    expect(earned).not.toContain("draw-arc");
  });

  it("writes the day it was earned, and the year only when it is not this one", async () => {
    const { earnedDay } = await import("@/lib/achievements");
    const now = new Date(2026, 8, 24);
    expect(earnedDay(new Date(2026, 7, 5), now)).toBe("5 Aug");
    expect(earnedDay(new Date(2025, 7, 5), now)).toBe("5 Aug 2025");
  });
});

describe("arrivals", () => {
  it("names the rows a change brought", async () => {
    const { arrivals } = await import("@/components/exit-list");
    expect([...arrivals([{ key: "a" }, { key: "b" }], [{ key: "b" }, { key: "c" }])]).toEqual(["c"]);
    expect(arrivals([{ key: "a" }], [{ key: "a" }]).size).toBe(0);
  });

  it("rises in after a press and never on first paint", () => {
    const block = css.slice(css.indexOf(".motion-rise-in {"));
    expect(block).toMatch(/animation: motion-arrive var\(--base\) var\(--ease-out\) calc\(var\(--i, 0\) \* 40ms\) both;/);
    expect(read("src/components/exit-list.tsx")).toContain('arrived.has(e.key) && !e.leaving ? "motion-rise-in"');
  });
});

describe("pills and pops", () => {
  it("slides a pill in every set of chips the round names", () => {
    for (const file of [
      "src/components/lists/sort-chips.tsx",
      "src/components/badges/board.tsx",
      "src/components/profile/parts.tsx",
      "src/components/calendar/day-strip.tsx",
    ]) {
      expect(read(file), file).toContain("<SegmentPill");
    }
  });

  it("pops a medal and the heart with one keyframe, at their own sizes", () => {
    expect(css).toMatch(/@keyframes motion-bump \{\s*50% \{\s*transform: scale\(var\(--bump, 1\.12\)\);/);
    expect(read("src/components/title/keep-buttons.tsx")).toContain("[--bump:1.25]");
    expect(read("src/components/badges/row.tsx")).toContain('"motion-bump"');
  });

  it("listens to no scroll in the spotlight", () => {
    // Round 9 follow-ups: the phone's track became the desktop's carousel, which does not scroll at all.
    const spotlight = read("src/components/discover/top-carousel.tsx");
    expect(spotlight).not.toMatch(/addEventListener\("scroll"/);
    expect(spotlight).not.toContain("scrollTo");
  });
});
