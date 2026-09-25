/*
 * Button classes the title pages share, spelt out rather than built from
 * `buttonClass` where a height differs from the library's three, so no two
 * height utilities ever meet on one element.
 */

import { PRESS } from "../motion";

const BASE = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 text-sm font-semibold disabled:opacity-60 ${PRESS}`;
/** Round icon buttons press too; they are spelt out below rather than built on `BASE`. */
const ICON = `inline-flex shrink-0 items-center justify-center rounded-full border-0 ${PRESS}`;

/** Phones, under the hero: Mark watched fills the row, the icon buttons follow. */
export const ACTIONS_MOBILE = "relative flex gap-2 lg:hidden";
export const PRIMARY_46 = `${BASE} h-[46px] min-w-0 grow bg-primary px-[18px] text-on-primary`;
export const GHOST_46 = `${BASE} h-[46px] min-w-0 grow bg-surface px-[18px] text-ink shadow-elevation hover:bg-surface-2`;
export const GHOST_ICON_46 = `${ICON} size-[46px] bg-surface text-ink shadow-elevation hover:bg-surface-2`;
/** A primary-shaped button that has nothing to do, such as "All watched". */
export const DISABLED_46 = `${BASE} h-[46px] min-w-0 grow bg-surface-2 px-[18px] text-ink-2`;

/** Desktop, on the hero: white for the main action, glass for the rest. */
export const WHITE_BUTTON = `${BASE} h-11 bg-white px-[18px] text-black`;
export const WHITE_46 = `${BASE} h-[46px] bg-white px-[18px] text-black`;
export const GLASS_BUTTON = `${BASE} h-11 bg-white/16 px-[18px] text-white backdrop-blur-[10px]`;
export const GLASS_46 = `${BASE} h-[46px] bg-white/16 px-[18px] text-white backdrop-blur-[10px]`;
export const GLASS_ICON = `${ICON} size-11 bg-white/16 text-white backdrop-blur-[10px]`;
export const GLASS_ICON_SM = `${ICON} size-10 bg-white/16 text-white backdrop-blur-[10px]`;
export const DISABLED_WHITE = `${BASE} h-11 bg-white/16 px-[18px] text-white/78`;

/**
 * The recommendations page's grid: three across on phones, and from `lg` as
 * many desktop-poster-width tracks as fit, the width More like this uses.
 */
export const SIMILAR_GRID =
  "grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,var(--poster-desk))] lg:justify-between lg:gap-x-(--tile-gap) lg:gap-y-4";

/**
 * The right-hand column of a series or film page. On phones `contents`, its
 * children joining the one column; between `lg` and `xl` two panels across
 * under the hero; from `xl` a column of its own that starts in the row after
 * the hero, level with the season chips (a film's cast), so the hero row holds
 * only the poster and the details and the backdrop shows whole.
 *
 * From `xl` it runs to the grid's last line, and the page ends its rows with a
 * `1fr` track for it (`xl:grid-rows-[...,1fr]`). A tall column spanning only
 * `auto` rows would share its extra height among them and open a gap between
 * the episodes and the cast; a flexible track takes all of it instead, below
 * everything else.
 */
export const TITLE_ASIDE =
  "contents lg:relative lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 xl:col-span-1 xl:col-start-3 xl:row-[2/-1] xl:flex xl:flex-col xl:items-stretch";
