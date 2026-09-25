/*
 * The News page's chips (Round 10), each an address (`?tab=`). Plain, so the
 * browser's "Last used" memory (`news/chip-memory.tsx`) checks against the
 * same list the server draws.
 */

export const CHIPS = [
  { id: "for-you", label: "For you" },
  { id: "top", label: "Top" },
  { id: "trailers", label: "Trailers" },
  { id: "renewals", label: "Renewals" },
  { id: "casting", label: "Casting" },
  { id: "dates", label: "Dates" },
  { id: "box-office", label: "Box office" },
  { id: "reviews", label: "Reviews" },
] as const;

export type Chip = (typeof CHIPS)[number]["id"];

/** A chip from the address. Round 9's `popular` is Top now, so an old link still lands. */
export function chipFrom(value: unknown): Chip | null {
  if (value === "popular") return "top";
  return CHIPS.some((c) => c.id === value) ? (value as Chip) : null;
}

export const chipLabel = (chip: Chip) => CHIPS.find((c) => c.id === chip)!.label;

export const CHIP_IDS = CHIPS.map((c) => c.id);

/** The feed shows this many cards at first, and this many more a press (Round 10 review). The lead is not one of them. */
export const FEED_STEP = 30;

/**
 * The feed's fold: how many cards show after `presses` presses of Show more,
 * and how many the next press would add (0 once the rows have run out).
 */
export function feedFold(total: number, presses: number, step = FEED_STEP) {
  const shown = Math.min(total, step * (presses + 1));
  return { shown, next: Math.min(step, total - shown) };
}
