/**
 * The level: the XP table, the curve and the rank names, carried over from the
 * current app unchanged so a level means the same thing in both.
 *
 * Pure, so the sidebar's line, the profile hero, the badges card and the
 * unlock toast all do the same arithmetic, and the tests can check it without
 * a database.
 *
 * Three decisions shape it. Watching is the floor and finishing is the reward:
 * an episode is worth very little on its own, and seeing a show through, a
 * franchise complete or a badge earned is worth hundreds of them. The curve
 * steepens, so every level is a bigger ask than the one before. And everybody
 * starts at level 0: an imported history draws a starting line rather than
 * handing out levels (see `achievements/xp.ts`).
 */

export type Tier = "bronze" | "silver" | "gold" | "legend";

/** What each thing is worth. */
export const XP = {
  /** Per episode watched, rewatches included. */
  episode: 12,
  /** Per film watched: longer, rarer, about four episodes' worth. */
  film: 45,
  /** Per show watched to the end of a finished run. */
  finishedShow: 300,
  /** Per franchise with every film seen: the hardest thing to do by accident. */
  franchise: 750,
  /** Per title rated. */
  rating: 8,
  /** On top of the rating, for writing something. */
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
 * Total XP needed to reach a level. Level 1 is 400, level 10 is 20,047, level
 * 25 about 100,000, and the cap a little under 300,000: at twelve XP an
 * episode, not something anyone reaches by the weekend.
 */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return Math.round(400 * Math.pow(level, 1.7));
}

/** Five levels a rank: often enough to chase, rarely enough to mean something. */
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
  for (const rank of RANKS) if (level >= rank.from) title = rank.title;
  return title;
}

/** The next level that carries a new title. */
export function nextRank(level: number): { title: string; level: number } | null {
  const current = rankFor(level);
  const upcoming = RANKS.find((rank) => rank.from > level && rank.title !== current);
  return upcoming ? { title: upcoming.title, level: upcoming.from } : null;
}

export type LevelProgress = {
  level: number;
  rank: string;
  xp: number;
  /** XP at which this level began, and at which the next begins. */
  floor: number;
  ceiling: number;
  toNextLevel: number;
  /** 0 to 100 through the current level; 100 at the cap. */
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
  const span = Math.max(1, ceiling - floor);
  return {
    level,
    rank: rankFor(level),
    xp: total,
    floor,
    ceiling,
    toNextLevel: maxed ? 0 : ceiling - total,
    percent: maxed ? 100 : Math.min(100, Math.floor(((total - floor) / span) * 100)),
    maxed,
  };
}

/** "12,660", the way every XP figure is printed. */
export function formatNumber(n: number) {
  return Math.round(n).toLocaleString("en-GB");
}

/** "2,340 XP to 15", or "Top level" at the cap: the right-hand half of the level line. */
export function toNextLabel(p: Pick<LevelProgress, "level" | "toNextLevel" | "maxed">) {
  return p.maxed ? "Top level" : `${formatNumber(p.toNextLevel)} XP to ${p.level + 1}`;
}
