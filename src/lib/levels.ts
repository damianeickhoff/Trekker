import type { Tier } from "./achievements/catalogue";

/**
 * The level behind the profile card.
 *
 * A plain module with no server imports, so the bar and the breakdown panel can
 * share the arithmetic with whatever computes it.
 *
 * Three decisions shape the whole thing. Watching is the floor and finishing is
 * the reward: an episode is worth very little on its own, and the bonuses for
 * seeing a show through to its end, completing a franchise or earning a badge
 * are worth hundreds of them. The curve steepens, so a level is always a bigger
 * ask than the one before it — the numbers below are deliberately slow. And
 * everybody starts at level 0: an imported history sets a starting line rather
 * than a starting level, so the bar measures time spent with Trekker. What that
 * history was worth is still worked out, and shown beside the rank as a lifetime
 * level. See `achievements/xp.ts`.
 */

/** What each thing is worth. */
export const XP = {
  /** Per episode watched, rewatches included. */
  episode: 12,
  /** Per film watched. Longer, rarer, and worth about four episodes. */
  film: 45,
  /** Per show watched to the end of a finished run. */
  finishedShow: 300,
  /** Per franchise with every film seen. The hardest thing to do by accident. */
  franchise: 750,
  /** Per title scored. */
  rating: 8,
  /** Extra, on top of the rating, for actually writing something. */
  review: 25,
} as const;

/** What a badge is worth, by how hard it was. */
export const BADGE_XP: Record<Tier, number> = {
  bronze: 150,
  silver: 300,
  gold: 750,
  legend: 2000,
};

export const MAX_LEVEL = 50;

/**
 * Total XP needed to *reach* a level. Level 0 is where everyone starts, and the
 * exponent is what makes each level cost more than the last: level 1 is 400 XP,
 * level 10 is 20,047, level 25 about 100,000 and level 50 — the top — a little
 * under 300,000. At twelve XP an episode that is not something anyone reaches
 * by the weekend.
 */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.round(400 * Math.pow(level, 1.7));
}

/**
 * Rank bands. Five levels each, so the title changes often enough to be worth
 * chasing but not so often that it stops meaning anything.
 */
const RANKS: { from: number; title: string }[] = [
  { from: 0, title: "Rookie" },
  { from: 5, title: "Novice" },
  { from: 10, title: "Regular" },
  { from: 15, title: "Enthusiast" },
  { from: 20, title: "Buff" },
  { from: 25, title: "Aficionado" },
  { from: 30, title: "Connoisseur" },
  { from: 35, title: "Cinephile" },
  { from: 40, title: "Master" },
  { from: 45, title: "Grandmaster" },
  { from: MAX_LEVEL, title: "Legendary" },
];

export function rankFor(level: number): string {
  let title = RANKS[0].title;
  for (const rank of RANKS) {
    if (level >= rank.from) title = rank.title;
  }
  return title;
}

/** The level after this one that carries a new title, for "next up" copy. */
export function nextRank(level: number): { title: string; level: number } | null {
  const current = rankFor(level);
  const upcoming = RANKS.find((rank) => rank.from > level && rank.title !== current);
  return upcoming ? { title: upcoming.title, level: upcoming.from } : null;
}

export type LevelProgress = {
  level: number;
  rank: string;
  xp: number;
  /** XP at which this level started, and at which the next one begins. */
  floor: number;
  ceiling: number;
  /** How far into the current level, and how much is left of it. */
  intoLevel: number;
  levelSpan: number;
  toNextLevel: number;
  /** 0-100 through the current level. 100 at the cap. */
  percent: number;
  maxed: boolean;
};

export function levelFromXp(xp: number): LevelProgress {
  const total = Math.max(0, Math.round(xp));

  let level = 0;
  while (level < MAX_LEVEL && total >= xpForLevel(level + 1)) level += 1;

  const floor = xpForLevel(level);
  const maxed = level >= MAX_LEVEL;
  const ceiling = maxed ? floor : xpForLevel(level + 1);
  const levelSpan = Math.max(1, ceiling - floor);
  const intoLevel = total - floor;

  return {
    level,
    rank: rankFor(level),
    xp: total,
    floor,
    ceiling,
    intoLevel,
    levelSpan,
    toNextLevel: maxed ? 0 : ceiling - total,
    percent: maxed ? 100 : Math.min(100, Math.floor((intoLevel / levelSpan) * 100)),
    maxed,
  };
}

/** "12,480 XP" — the same shape everywhere it appears. */
export function formatXp(xp: number) {
  return `${Math.round(xp).toLocaleString("en-GB")} XP`;
}
