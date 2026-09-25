/**
 * Discover's top five (Round 9): which places go where, and the carousel that
 * turns through #1 to #3. Pure and clock-free, so the state machine can be
 * tested without a browser; `components/discover/use-carousel.ts` runs it on
 * a `setTimeout` chain, and the crossfade and the slow zoom are CSS.
 */

/** How long a slide shows before the next begins to come in, counted from the start of its own change, so the rhythm is seven seconds whatever the change takes. */
export const DWELL_MS = 7_000;

/** The change itself: the pictures crossfading, the words giving way. Its zoom runs on through it, so the slow zoom's keyframes last DWELL_MS + CHANGE_MS. */
export const CHANGE_MS = 1_200;

/**
 * Where each of the top 20 goes. Both widths turn #1 to #3 in the carousel;
 * the desktop stacks #4 and #5 beside it and starts the rest at #6, while a
 * phone, with no room beside it, starts the rest at #4.
 */
export function splitTop<T>(items: readonly T[], width: "desktop" | "phone") {
  const from = width === "desktop" ? 5 : 3;
  return {
    carousel: items.slice(0, 3),
    stacked: width === "desktop" ? items.slice(3, 5).map((item, i) => ({ item, rank: i + 4 })) : [],
    rest: items.slice(from, 20).map((item, i) => ({ item, rank: i + from + 1 })),
  };
}

/**
 * A synopsis cut to whole words within `max` characters, with an ellipsis,
 * for a card that clamps it to a few lines: the clamp's own ellipsis can land
 * mid-word, this one cannot, and it is short enough that the clamp rarely has
 * to act at all.
 */
export function clipWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  const words = (space > max * 0.6 ? cut.slice(0, space) : clean.slice(0, max)).replace(/[\s,.;:–—-]+$/, "");
  return `${words}…`;
}

/**
 * Where the carousel is and whether it is moving.
 *
 * - `index` is the slide showing, `prev` the one fading out as it comes in
 *   (its zoom runs on while it goes, so neither picture stands still),
 *   `shown` how many times each slide has
 *   come in: its parity names the zoom's keyframes, so a slide that comes back
 *   restarts its zoom even when there are only two.
 * - It moves only when it is `ready` (the page has hydrated and the clock is
 *   known), not under a pointer (`hover`) or holding focus (`focus`), not in a
 *   hidden tab (`hidden`), not with reduced motion (`still`), and when there
 *   is more than one slide.
 * - `left` is what remains of the current slide's dwell as of `since`, the
 *   moment it last started moving; paused, `since` is null and `left` is
 *   frozen, so leaving the card resumes the dwell (and the zoom, which pauses
 *   with it) where it stopped rather than from the top.
 */
export type CarouselState = {
  count: number;
  index: number;
  prev: number | null;
  shown: number[];
  ready: boolean;
  hover: boolean;
  focus: boolean;
  hidden: boolean;
  still: boolean;
  left: number;
  since: number | null;
};

export type CarouselEvent =
  | { type: "begin"; still: boolean; hidden: boolean }
  | { type: "tick" }
  | { type: "jump"; index: number }
  | { type: "hover"; on: boolean }
  | { type: "focus"; on: boolean }
  | { type: "hidden"; on: boolean }
  | { type: "still"; on: boolean };

export function carouselStart(count: number): CarouselState {
  return {
    count,
    index: 0,
    prev: null,
    shown: Array.from({ length: count }, (_, i) => (i === 0 ? 1 : 0)),
    ready: false,
    hover: false,
    focus: false,
    hidden: false,
    still: false,
    left: DWELL_MS,
    since: null,
  };
}

export function running(s: CarouselState): boolean {
  return s.ready && !s.hover && !s.focus && !s.hidden && !s.still && s.count > 1;
}

export const nextIndex = (index: number, count: number) => (count > 0 ? (index + 1) % count : 0);
export const previousIndex = (index: number, count: number) => (count > 0 ? (index - 1 + count) % count : 0);

/** How far a finger must travel sideways, and further than it travels down, to count as a swipe. */
export const SWIPE_PX = 40;

/** A finished touch on the phone's card: 1 for the next slide (swiped left), -1 for the previous, 0 for a tap or a scroll. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Freezes or restarts the dwell clock across a change in whether it is moving. */
function settle(from: CarouselState, to: CarouselState, now: number): CarouselState {
  const was = running(from);
  const is = running(to);
  if (was && !is) return { ...to, left: Math.max(0, to.left - (now - (from.since ?? now))), since: null };
  if (!was && is) return { ...to, since: now };
  return to;
}

function show(s: CarouselState, index: number, now: number): CarouselState {
  const shown = s.shown.slice();
  shown[index] = (shown[index] ?? 0) + 1;
  return { ...s, index, prev: s.index, shown, left: DWELL_MS, since: running(s) ? now : null };
}

/** One event, at `now` (any monotonic clock). An event that changes nothing returns the state it was given. */
export function carouselStep(s: CarouselState, e: CarouselEvent, now: number): CarouselState {
  switch (e.type) {
    case "begin":
      if (s.ready) return s;
      return settle(s, { ...s, ready: true, still: e.still, hidden: e.hidden }, now);
    case "tick":
      // A timer from before a pause can still fire: only a moving carousel advances.
      return running(s) ? show(s, nextIndex(s.index, s.count), now) : s;
    case "jump":
      if (e.index === s.index || e.index < 0 || e.index >= s.count) return s;
      return show(s, e.index, now);
    case "hover":
    case "focus":
    case "hidden":
    case "still":
      return s[e.type] === e.on ? s : settle(s, { ...s, [e.type]: e.on }, now);
  }
}

/** How long until the next slide, or null while it is not moving. */
export function dueIn(s: CarouselState, now: number): number | null {
  return running(s) && s.since !== null ? Math.max(0, s.left - (now - s.since)) : null;
}

/** The zoom's keyframes for a slide, or null for a slide neither showing nor fading out. */
export function dwellName(s: CarouselState, i: number): "a" | "b" | null {
  if (i !== s.index && i !== s.prev) return null;
  return (s.shown[i] ?? 0) % 2 === 1 ? "a" : "b";
}
