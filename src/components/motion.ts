/*
 * The motion classes components share (STYLE.md, Motion), spelt out once so
 * every button presses and every row washes the same way. All of them run
 * on the tokens in `globals.css`; Tailwind's `hover:` only matches on a
 * device that can hover, so a finger never leaves a wash behind.
 */

/**
 * A button or chip answering the finger: 3% smaller while pressed, over
 * `--fast`, and never while disabled. `motion-safe:` so reduced motion has no
 * press at all rather than an instant one. The fill's change on hover rides
 * the same transition.
 */
export const PRESS =
  "transition-[scale,background-color,color] duration-(--fast) ease-out motion-safe:not-disabled:active:scale-[0.97]";

/**
 * A row answering the pointer: a wash of the ink behind it, no movement. The
 * wash is a pseudo-element that only fades, so the row's own box and layout
 * never change; it reaches 8px past the row's edges so the content inside it
 * does not touch the wash's edge. `isolate` keeps it above the row's own
 * background and under its content.
 */
export const ROW_WASH =
  "relative isolate before:pointer-events-none before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-xl before:bg-ink/6 before:opacity-0 before:transition-opacity before:duration-(--fast) before:ease-out hover:before:opacity-100";

/*
 * Artwork answering the pointer (every poster, wide card, chart card, person
 * and genre tile, list mosaic and spotlight card): the picture zooms to 1.04
 * inside its rounded frame, which clips it, and the frame's shadow deepens
 * with it, both over `--base`. Three parts, because a clip and a shadow
 * cannot be the same box (the clip would cut the shadow off):
 *
 *   ZOOM_GROUP   on the link or card the pointer is over (a named group, so
 *                a row or panel that is a `group` of its own does not set it off)
 *   ZOOM_SHADOW  on a non-clipping rounded box round the frame: a deeper
 *                shadow as a pseudo-element that only fades in
 *   ZOOM         on the picture itself, inside the `overflow-hidden` frame
 *
 * Only the picture moves: the chips on it, the scrim, the words at its foot
 * and the caption under it stay still. Hover only matches on a device that
 * can hover, and the zoom is `motion-safe:`, so reduced motion has none.
 */
export const ZOOM_GROUP = "group/zoom";
export const ZOOM_SHADOW =
  "relative after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.5)] after:opacity-0 after:transition-opacity after:duration-(--base) after:ease-out group-hover/zoom:after:opacity-100";
export const ZOOM = "zoom-art transition-[scale] duration-(--slow) ease-out motion-safe:group-hover/zoom:scale-[1.04]";

/**
 * A fold's chevron (the challenge strip, Also waiting, Settings' cards, the
 * filter folds): a `chevR` that points down while shut (`rotate-90`) and up
 * while open (`-rotate-90`), turning the 180° between over `--base`, in step
 * with the fold itself.
 */
export function foldChevron(open: boolean) {
  return `transition-[rotate] duration-(--base) ease-out ${open ? "-rotate-90" : "rotate-90"}`;
}

/*
 * Segmented controls, whose chosen option is one sliding pill (`SegmentPill`
 * in `segment-pill.tsx`). Here rather than beside it because server
 * components draw options too, and a client module cannot hand them a string.
 */

/** Filled when chosen until the pill takes over, then clear over it. */
export const HANDED_OVER = "in-data-[sliding=on]:data-on:bg-transparent! in-data-[sliding=on]:data-on:shadow-none!";

/** An option in the theme picker's track: Theme, Screensaver, the smart list's mode. Its pill is `SEGMENT_TRACK_PILL`. */
export const segmentOption = `relative h-8 rounded-[9px] border-0 bg-transparent px-3.5 text-[13px] font-semibold text-ink-2 transition-colors duration-(--fast) ease-out data-on:bg-primary data-on:text-on-primary ${HANDED_OVER}`;
export const SEGMENT_TRACK = "relative inline-flex gap-0.5 rounded-xl bg-surface-2 p-[3px]";
export const SEGMENT_TRACK_PILL = "rounded-[9px] bg-primary";

/**
 * A filter chip that is one of a set (Discover's Everything, Shows, Films;
 * the review's Year and Month): `filterChipClass`, chosen by `data-on`. Its
 * pill is `SEGMENT_CHIP_PILL`.
 */
export const segmentChip = `relative inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border-0 px-3.5 text-[13px] font-semibold ${PRESS} bg-surface text-ink shadow-elevation not-data-on:hover:bg-surface-2 data-on:bg-primary data-on:text-on-primary data-on:shadow-none ${HANDED_OVER}`;
export const SEGMENT_CHIP_PILL = "rounded-full bg-primary";

/**
 * A progress bar's amber fill: the whole track's width, slid left by what is
 * still to go, so a new value moves it by `translate` over `--slow` rather
 * than by laying out a new width. The track clips it (`overflow-hidden`) and
 * its rounded end shows. A value drawn on the server is where it rests on
 * first paint: a transition only runs when the value changes after mount.
 */
export const FILL = "block h-full w-full rounded-full bg-accent transition-[translate] duration-(--slow) ease-out";

export function fillTo(percent: number) {
  const p = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  return { translate: `${p - 100}% 0` };
}
