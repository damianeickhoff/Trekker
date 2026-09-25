import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHANGE_MS,
  DWELL_MS,
  carouselStart,
  carouselStep,
  clipWords,
  dueIn,
  dwellName,
  previousIndex,
  running,
  splitTop,
  swipeStep,
  type CarouselEvent,
  type CarouselState,
} from "@/lib/spotlight";

/*
 * Round 9, Discover's top five: where each place goes, and the carousel's
 * state machine (the timer and the CSS are the browser's; what they are told
 * to do is here). Plus the few things in the source a browser would be
 * needed to see.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** Runs events in order, each at its own time. */
function run(events: [number, CarouselEvent][], start = carouselStart(3)): CarouselState {
  return events.reduce((s, [at, e]) => carouselStep(s, e, at), start);
}
const begun = (count = 3, at = 0) => carouselStep(carouselStart(count), { type: "begin", still: false, hidden: false }, at);

describe("the top five", () => {
  const items = Array.from({ length: 20 }, (_, i) => `t${i + 1}`);

  it("on desktop puts #1 to #3 in the carousel, #4 and #5 beside it, and starts the rest at #6", () => {
    const { carousel, stacked, rest } = splitTop(items, "desktop");
    expect(carousel).toEqual(["t1", "t2", "t3"]);
    expect(stacked).toEqual([
      { item: "t4", rank: 4 },
      { item: "t5", rank: 5 },
    ]);
    expect(rest[0]).toEqual({ item: "t6", rank: 6 });
    expect(rest.at(-1)).toEqual({ item: "t20", rank: 20 });
    expect(rest).toHaveLength(15);
    expect(splitTop(["a", "b"], "desktop")).toEqual({ carousel: ["a", "b"], stacked: [], rest: [] });
  });

  it("on a phone turns the same three and starts the rest at #4, with nothing beside", () => {
    const { carousel, stacked, rest } = splitTop(items, "phone");
    expect(carousel).toEqual(["t1", "t2", "t3"]);
    expect(stacked).toEqual([]);
    expect(rest[0]).toEqual({ item: "t4", rank: 4 });
    expect(rest.at(-1)).toEqual({ item: "t20", rank: 20 });
    expect(rest).toHaveLength(17);
  });

  it("reads a sideways swipe as a step and anything else as nothing", () => {
    expect(swipeStep(-80, 10)).toBe(1);
    expect(swipeStep(90, -5)).toBe(-1);
    expect(swipeStep(-20, 0)).toBe(0);
    expect(swipeStep(-60, 80)).toBe(0);
    expect(previousIndex(0, 3)).toBe(2);
  });

  it("cuts a synopsis at a word, never inside one", () => {
    expect(clipWords("Short enough.", 40)).toBe("Short enough.");
    const cut = clipWords("A retired assassin is pulled back into the underworld, one last time, by an old debt.", 50);
    expect(cut).toBe("A retired assassin is pulled back into the…");
    expect(cut.length).toBeLessThanOrEqual(51);
    expect(clipWords("Spaces   squashed\n\ntogether", 100)).toBe("Spaces squashed together");
  });
});

describe("the carousel", () => {
  it("does not move before it has begun, nor with one slide", () => {
    expect(running(carouselStart(3))).toBe(false);
    expect(dueIn(carouselStart(3), 0)).toBeNull();
    expect(running(begun(1))).toBe(false);
  });

  it("turns #1, #2, #3 and round again, a dwell apart", () => {
    let s = begun(3, 0);
    const order = [s.index];
    for (let t = 1; t <= 4; t++) {
      expect(dueIn(s, (t - 1) * DWELL_MS)).toBe(DWELL_MS);
      s = carouselStep(s, { type: "tick" }, t * DWELL_MS);
      order.push(s.index);
    }
    expect(order).toEqual([0, 1, 2, 0, 1]);
    expect(s.prev).toBe(0);
  });

  it("pauses under a pointer with what was left of the dwell, and resumes from there", () => {
    const s = run([
      [0, { type: "begin", still: false, hidden: false }],
      [3_000, { type: "hover", on: true }],
    ]);
    expect(running(s)).toBe(false);
    expect(dueIn(s, 10_000)).toBeNull();
    expect(s.left).toBe(4_000);
    // A timer set before the pause can still fire: it moves nothing.
    expect(carouselStep(s, { type: "tick" }, 7_000)).toBe(s);
    const resumed = carouselStep(s, { type: "hover", on: false }, 20_000);
    expect(running(resumed)).toBe(true);
    expect(dueIn(resumed, 20_000)).toBe(4_000);
    expect(dueIn(resumed, 21_000)).toBe(3_000);
    expect(resumed.index).toBe(0);
  });

  it("pauses in a hidden tab and while focus is inside, each on its own", () => {
    const hidden = run([
      [0, { type: "begin", still: false, hidden: false }],
      [1_000, { type: "hidden", on: true }],
      [2_000, { type: "focus", on: true }],
      [5_000, { type: "hidden", on: false }],
    ]);
    expect(running(hidden)).toBe(false);
    expect(hidden.left).toBe(6_000);
    const back = carouselStep(hidden, { type: "focus", on: false }, 9_000);
    expect(dueIn(back, 9_000)).toBe(6_000);
  });

  it("begins paused in a tab that is already hidden", () => {
    const s = carouselStep(carouselStart(3), { type: "begin", still: false, hidden: true }, 0);
    expect(running(s)).toBe(false);
    expect(dueIn(carouselStep(s, { type: "hidden", on: false }, 500), 500)).toBe(DWELL_MS);
  });

  it("with reduced motion shows #1 and never advances, but the dots still step", () => {
    const s = carouselStep(carouselStart(3), { type: "begin", still: true, hidden: false }, 0);
    expect(s.index).toBe(0);
    expect(dueIn(s, 0)).toBeNull();
    expect(carouselStep(s, { type: "tick" }, DWELL_MS)).toBe(s);
    const jumped = carouselStep(s, { type: "jump", index: 2 }, 100);
    expect(jumped.index).toBe(2);
    expect(dueIn(jumped, 100)).toBeNull();
  });

  it("restarts the dwell on a jump, and ignores a jump to where it is", () => {
    const s = run([
      [0, { type: "begin", still: false, hidden: false }],
      [5_000, { type: "jump", index: 2 }],
    ]);
    expect(s.index).toBe(2);
    expect(dueIn(s, 5_000)).toBe(DWELL_MS);
    expect(carouselStep(s, { type: "jump", index: 2 }, 6_000)).toBe(s);
    expect(carouselStep(s, { type: "jump", index: 7 }, 6_000)).toBe(s);
  });

  it("names the zoom by showings, so a slide coming back restarts it, even with two", () => {
    let s = begun(2, 0);
    expect([dwellName(s, 0), dwellName(s, 1)]).toEqual(["a", null]);
    s = carouselStep(s, { type: "tick" }, DWELL_MS);
    // #2 zooms; #1 fades out, keeping its name, so its zoom runs on.
    expect([dwellName(s, 0), dwellName(s, 1)]).toEqual(["a", "a"]);
    s = carouselStep(s, { type: "tick" }, 2 * DWELL_MS);
    expect(dwellName(s, 0)).toBe("b");
    const three = run([
      [0, { type: "begin", still: false, hidden: false }],
      [1, { type: "tick" }],
      [2, { type: "tick" }],
    ]);
    // Neither showing nor leaving: no zoom at all.
    expect(dwellName(three, 0)).toBeNull();
  });

  it("zooms through the dwell and the change, crossfades over 1.2s, and staggers the words", () => {
    const css = read("src/components/discover/carousel.module.css");
    expect(DWELL_MS).toBe(7_000);
    expect(CHANGE_MS).toBe(1_200);
    // 1 to 1.08 over the dwell, on at the same rate through the change.
    expect(css).toMatch(/animation: dwell-a 8\.2s linear both;/);
    expect(1 + (0.08 * (DWELL_MS + CHANGE_MS)) / DWELL_MS).toBeCloseTo(1.0937, 4);
    expect(css).toMatch(/to \{\s*scale: 1\.0937;/);
    expect(css).toMatch(/transition: opacity 1200ms var\(--ease-in-out\);/);
    expect(css).toMatch(/opacity 400ms var\(--ease-out\) 400ms,\s*translate 400ms var\(--ease-out\) 400ms;/);
    expect(css).toMatch(/opacity 300ms var\(--ease-in\),/);
    expect(read("src/app/globals.css")).toMatch(/--ease-in-out: cubic-bezier\(/);
    // Reduced motion is a cut: no transition or keyframe outside no-preference.
    const open = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const rules = css.slice(css.indexOf("*/") + 2, open);
    expect(open).toBeGreaterThan(0);
    expect(rules).not.toMatch(/transition|animation|@keyframes/);
    const source = read("src/components/discover/top-carousel.tsx");
    expect(source).not.toMatch(/\bZOOM\b(?!_)/);
    expect(source).toContain("<DwellArt");
    // Both widths draw the one carousel; the old swipe track is gone.
    const page = read("src/components/discover/discover-page.tsx");
    expect(page).toContain('<TopCarousel size="phone"');
    expect(page).toContain('<TopCarousel size="desk"');
    expect(page).not.toMatch(/<Spotlight[\s>]/);
    // The timer is a setTimeout chain, not an animation loop.
    const hook = read("src/components/discover/use-carousel.ts");
    expect(hook).toContain("setTimeout(");
    expect(hook).not.toMatch(/requestAnimationFrame|setInterval/);
  });
});
