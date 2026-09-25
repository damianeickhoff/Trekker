import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXIT, Presence, presenceAfter } from "@/components/presence";

/*
 * Motion is mostly a browser's business, so this pins what can be read
 * without one: the tokens and their values, that every keyframe the motion
 * utilities use is declared only where motion is welcome, that `Presence`
 * mounts, marks and lets go as it should, and that components carry the
 * classes that make them move.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const css = read("src/app/globals.css");

/** The body of every top-level `@media (prefers-reduced-motion: no-preference)` block. */
function noPreferenceBlocks(source: string) {
  const out: string[] = [];
  const re = /@media \(prefers-reduced-motion: no-preference\) \{/g;
  for (const m of source.matchAll(re)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
    }
    out.push(source.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

describe("the motion tokens", () => {
  it("are the plan's curves and durations", () => {
    expect(css).toMatch(/--ease-out: cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);/);
    expect(css).toMatch(/--ease-spring: cubic-bezier\(0\.2, 0\.9, 0\.3, 1\.2\);/);
    expect(css).toMatch(/--ease-in: cubic-bezier\(/);
    expect(css).toMatch(/--fast: 150ms;/);
    expect(css).toMatch(/--base: 250ms;/);
    expect(css).toMatch(/--slow: 400ms;/);
  });

  it("agree with the exits Presence waits for", () => {
    expect(EXIT.fast).toBe(150);
    expect(EXIT.base).toBe(250);
  });

  it("keep reduced motion a cut: transitions zeroed, and every keyframe but the feedback declared under no-preference", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?transition-duration: 0s !important;/);
    // The feedback that carries meaning is declared at the top level on purpose.
    const feedback = new Set(["tick-flash-fade", "tick-flash-scale", "when-drain"]);
    const inside = noPreferenceBlocks(css).join("\n");
    for (const [, name] of css.matchAll(/@keyframes ([\w-]+)/g)) {
      if (feedback.has(name)) continue;
      expect(inside, `@keyframes ${name}`).toContain(`@keyframes ${name}`);
    }
  });

  it("are used rather than bare numbers in components", () => {
    const files = [
      "src/components/tab-bar.tsx",
      "src/components/settings/facts.tsx",
    ];
    for (const file of files) expect(read(file), file).not.toMatch(/\bduration-\d/);
  });
});

describe("Presence", () => {
  it("mounts on open, holds through close, and lets go once the exit has run", () => {
    expect(presenceAfter(false, "open", true)).toBe(true);
    expect(presenceAfter(true, "close", false)).toBe(true);
    expect(presenceAfter(true, "exited", false)).toBe(false);
    // An exit that finishes after it was opened again does not unmount it.
    expect(presenceAfter(true, "exited", true)).toBe(true);
  });

  it("renders its child marked open, and nothing while closed", () => {
    const open = renderToStaticMarkup(createElement(Presence, { open: true }, createElement("div", { className: "x" })));
    expect(open).toBe('<div class="x" data-state="open"></div>');
    const closed = renderToStaticMarkup(createElement(Presence, { open: false }, createElement("div", null)));
    expect(closed).toBe("");
  });
});

describe("press and hover", () => {
  it("presses every button kind and chip, never while disabled and never with reduced motion", async () => {
    const { buttonClass, iconButtonClass, filterChipClass } = await import("@/components/ui");
    const { PRESS } = await import("@/components/motion");
    expect(PRESS).toContain("motion-safe:not-disabled:active:scale-[0.97]");
    expect(PRESS).toContain("duration-(--fast)");
    for (const kind of ["primary", "white", "amber", "glass", "ghost"] as const) {
      expect(buttonClass(kind)).toContain(PRESS);
      expect(iconButtonClass(kind)).toContain(PRESS);
    }
    expect(filterChipClass(false)).toContain(PRESS);
    // Only the ghost lifts its fill.
    expect(buttonClass("ghost")).toContain("hover:bg-surface-2");
    expect(buttonClass("primary")).not.toContain("hover:bg-surface-2");
  });

  it("slides a switch's knob by translate, not by laying it out again", async () => {
    const { switchKnobClass, switchTrackClass } = await import("@/components/ui");
    for (const on of [true, false]) {
      expect(switchKnobClass(on)).not.toMatch(/\bleft-\[21px\]/);
      expect(switchKnobClass(on)).toContain("transition-[translate,background-color]");
      expect(switchTrackClass(on)).toContain("transition-colors");
    }
    expect(switchKnobClass(true)).toContain("translate-x-[18px]");
  });

  it("zooms a card's artwork inside its frame by scale, and deepens its shadow by opacity", async () => {
    const { ZOOM, ZOOM_SHADOW, ZOOM_GROUP, ROW_WASH } = await import("@/components/motion");
    expect(ZOOM).toContain("transition-[scale] duration-(--slow) ease-out");
    expect(ZOOM).toContain("motion-safe:group-hover/zoom:scale-[1.04]");
    expect(ZOOM_SHADOW).toContain("group-hover/zoom:after:opacity-100");
    expect(ZOOM_SHADOW).not.toMatch(/translate/);
    expect(ZOOM_GROUP).toBe("group/zoom");
    // The picture moves; the card and its caption do not.
    const card = read("src/components/poster-card.tsx");
    expect(card).not.toMatch(/-translate-y-0\.5/);
    expect(card.split("${ZOOM}").length - 1).toBeGreaterThanOrEqual(3);
    expect(ROW_WASH).toContain("before:transition-opacity");
    expect(ROW_WASH).not.toMatch(/translate/);
  });

  it("draws a segmented control's chosen option filled until the pill takes over", async () => {
    const { segmentChip, segmentOption } = await import("@/components/motion");
    for (const cls of [segmentChip, segmentOption]) {
      expect(cls).toContain("data-on:bg-primary");
      expect(cls).toContain("in-data-[sliding=on]:data-on:bg-transparent!");
    }
    const pill = read("src/components/segment-pill.tsx");
    expect(pill).toContain("transition-[translate] duration-(--base)");
  });
});

describe("sheets, menus and toasts", () => {
  const components = path.join(root, "src/components");
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? sources(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
    );

  it("gives every menu drawn on MENU a data-state, so it can leave", () => {
    for (const file of sources(components)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<div[^>]*className=\{`\$\{MENU\}[^>]*>/g)) {
        expect(m[0], path.relative(root, file)).toContain("data-state=");
      }
    }
  });

  it("declares each presence utility's open and closed states under no-preference", () => {
    const inside = noPreferenceBlocks(css).join("\n");
    for (const name of ["motion-scrim", "motion-sheet", "motion-pop", "motion-toast", "motion-fold"]) {
      expect(inside, name).toContain(`.${name}[data-state="open"]`);
      expect(inside, name).toContain(`.${name}[data-state="closed"]`);
    }
    // Leaving panels let presses through at once, with or without motion.
    expect(css).toMatch(/\[data-state="closed"\] \{\s*pointer-events: none;/);
  });

  it("marks the dialog, its shade and the toast with the presence state", () => {
    const dialog = read("src/components/lists/dialog.tsx");
    expect(dialog).toContain("usePresenceState()");
    expect(dialog.match(/data-state=\{state\}/g)).toHaveLength(2);
    expect(dialog).toContain("DRAG_CLOSE = 80");
    expect(read("src/components/bell/badge-toast.tsx")).toContain("motion-toast");
  });
});

describe("rails and lists", () => {
  it("keeps a row that has gone, marked leaving, after the row it followed", async () => {
    const { withLeaving } = await import("@/components/exit-list");
    const e = (key: string, leaving = false) => ({ key, value: key, leaving });
    const before = [e("a"), e("b"), e("c"), e("d")];
    const next = [e("a"), e("d")].map(({ key, value }) => ({ key, value }));
    expect(withLeaving(before, next, true)).toEqual([e("a"), e("b", true), e("c", true), e("d")]);
    // The first row gone stands first.
    expect(withLeaving(before, [{ key: "b", value: "b" }], true).map((x) => [x.key, x.leaving])).toEqual([
      ["a", true],
      ["b", false],
      ["c", true],
      ["d", true],
    ]);
    // A row that comes back while leaving stays; without a reason to animate, gone is gone.
    expect(withLeaving([e("a"), e("b", true)], [{ key: "b", value: "b" }, { key: "a", value: "a" }], true)).toEqual([e("b"), e("a")]);
    expect(withLeaving(before, next, false)).toEqual([e("a"), e("d")]);
  });

  it("collapses a leaving row by fading, then closing its grid row", () => {
    const inside = noPreferenceBlocks(css).join("\n");
    expect(inside).toMatch(/\.motion-collapse\[data-state="closed"\] \{\s*animation:\s*motion-fade-out var\(--fast\)[^;]*,\s*motion-shrink var\(--base\) var\(--ease-out\) var\(--fast\) both;/);
  });

  it("snaps rails on phones only, and nudges a section head's chevron", () => {
    const rail = read("src/components/rail.tsx");
    for (const cls of ["snap-x", "snap-proximity", "scroll-px-5", "*:snap-start", "lg:snap-none"]) expect(rail).toContain(cls);
    expect(read("src/components/section-head.tsx")).toContain("hover:translate-x-0.5");
  });
});

describe("Home and the tick", () => {
  it("shows the first episode still: a Swap only moves when its id changes after mount", async () => {
    const { Swap } = await import("@/components/swap");
    const seq = renderToStaticMarkup(createElement(Swap, { id: "1-1-2" }, createElement("b", null, "S01E02")));
    expect(seq).toBe("<div><b>S01E02</b></div>");
    const cross = renderToStaticMarkup(createElement(Swap, { id: "1", mode: "crossfade" }, createElement("i")));
    expect(cross).not.toContain("motion-swap");
  });

  it("moves a progress fill by translate from where the server drew it", async () => {
    const { FILL, fillTo } = await import("@/components/motion");
    expect(FILL).toContain("transition-[translate] duration-(--slow) ease-out");
    expect(fillTo(40)).toEqual({ translate: "-60% 0" });
    expect(fillTo(140)).toEqual({ translate: "0% 0" });
    expect(fillTo(-5)).toEqual({ translate: "-100% 0" });
    expect(fillTo(Number.NaN)).toEqual({ translate: "-100% 0" });
    // No amber fill is sized by width any more, so none lays out when it moves.
    for (const file of ["src/components/home/challenge-strip.tsx", "src/components/level-line.tsx", "src/components/profile/hero.tsx", "src/components/title/sections.tsx"]) {
      expect(read(file), file).not.toMatch(/bg-accent" style=\{\{ width/);
    }
  });

  it("counts the challenge strip's figures only when they change", async () => {
    const strip = read("src/components/home/challenge-strip.tsx");
    expect(strip.match(/<Count [^>]*on="change"/g)).toHaveLength(2);
    const { Count } = await import("@/components/count");
    expect(renderToStaticMarkup(createElement(Count, { to: 1250, on: "change" }))).toBe('<span class="tabular-nums">1,250</span>');
  });
});

describe("title, episode and film pages", () => {
  it("settles a hero's backdrop only in its own stylesheet, only with motion, and only once loaded", () => {
    const settle = read("src/components/title/hero-settle.module.css");
    const block = noPreferenceBlocks(settle).join("\n");
    expect(block).toContain(".settle[data-loaded]");
    expect(block).toMatch(/animation: settle 1\.2s var\(--ease-out\) both/);
    expect(block).toContain("scale(1.04)");
    // Nothing of it outside the media rule, so reduced motion has no scale at all.
    expect(settle.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*\}\s*$/, "")).not.toContain("transform");
    expect(read("src/components/title/hero.tsx")).toContain("<SettlingImage");
  });

  it("cascades ticks 30ms apart, no more than ten steps", () => {
    expect(css).toMatch(/\.tick-pop\[data-pop\]\[aria-pressed="true"\] > \* \{\s*animation: tick-pop var\(--base\) var\(--ease-spring\) calc\(min\(var\(--cascade, 0\), 9\) \* 30ms\) both;/);
  });

  it("slides a travelled-to episode 12px from the side it came from, and nothing else", async () => {
    expect(css).toMatch(/div\[data-travel="prev"\] \{\s*--motion-from: -12px;/);
    expect(css).toMatch(/--motion-from, 12px/);
    const page = read("src/components/title/episode-page.tsx");
    expect(page.match(/data-travel-to=\{dir\}/g)).toHaveLength(2);
    const { EpisodeArrival } = await import("@/components/title/episode-travel");
    expect(renderToStaticMarkup(createElement(EpisodeArrival, { className: "x" }, "E05"))).toBe('<div class="x">E05</div>');
  });

  it("crosses a season's episodes over the last in one grid cell", () => {
    expect(read("src/components/title/sections.tsx")).toContain('<Swap id={String(season)} mode="stack">');
    const inside = noPreferenceBlocks(css).join("\n");
    expect(inside).toContain(".motion-swap-grow {");
  });
});

describe("route transitions (M7)", () => {
  it("stay off: Next 16.3 has no viewTransition flag to put them behind, and nothing renders a <ViewTransition>", () => {
    // The plan's `experimental.viewTransition` is gone from this Next; view transitions are always on in the App Router.
    const shared = read("node_modules/next/dist/server/config-shared.d.ts");
    expect(shared).not.toMatch(/viewTransition\??:/);
    expect(read("next.config.ts")).not.toMatch(/viewTransition/);
    const components = path.join(root, "src");
    const all = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "generated" ? [] : all(path.join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [],
      );
    for (const file of all(components)) expect(readFileSync(file, "utf8"), path.relative(root, file)).not.toMatch(/<ViewTransition\b|transitionTypes=/);
  });
});
