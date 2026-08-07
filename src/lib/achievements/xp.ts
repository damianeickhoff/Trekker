import "server-only";
import { db } from "../db";
import {
  BADGE_XP,
  XP,
  levelFromXp,
  nextRank,
  rankFor,
  type LevelProgress,
} from "../levels";
import { ACHIEVEMENTS_BY_ID, type Tier } from "./catalogue";

/** One line of the breakdown: what it was, how much of it, what it was worth. */
export type XpSource = {
  key: string;
  label: string;
  /** How the total was arrived at, e.g. "412 × 12". */
  detail: string;
  count: number;
  xp: number;
  icon: string;
};

export type LevelState = LevelProgress & {
  /** Where the *Trekker* XP came from — the bar's own arithmetic. */
  sources: XpSource[];
  next: { title: string; level: number } | null;
  /**
   * What the whole history comes to, imported years included. Shown as a note
   * beside the rank rather than as a second bar — it is context for the level,
   * not another thing to fill in.
   */
  lifetime: { level: number; rank: string; xp: number };
  /** What arrived with an imported history and pays nothing towards the bar. */
  carriedXp: number;
  /**
   * When the two completion bonuses were last worked out. Null until the
   * achievements page has been opened once.
   */
  syncedAt: Date | null;
};

/** Play sources that came from somewhere else rather than from using Trekker. */
const IMPORTED_SOURCES = ["trakt", "backfill"];

/** Whether any of this history was carried in rather than recorded here. */
export async function hasImportedHistory(userId: string) {
  const count = await db.play.count({
    where: { userId, source: { in: IMPORTED_SOURCES } },
  });
  return count > 0;
}

type Counts = {
  episodes: number;
  films: number;
  finishedShows: number;
  franchises: number;
  badges: number;
  badgeXp: number;
  challenges: number;
  challengeXp: number;
  ratings: number;
  reviews: number;
};

function sourcesFor(counts: Counts): XpSource[] {
  return [
    {
      key: "episodes",
      label: "Episodes watched",
      detail: `${counts.episodes.toLocaleString("en-GB")} × ${XP.episode}`,
      count: counts.episodes,
      xp: counts.episodes * XP.episode,
      icon: "tv",
    },
    {
      key: "films",
      label: "Films watched",
      detail: `${counts.films.toLocaleString("en-GB")} × ${XP.film}`,
      count: counts.films,
      xp: counts.films * XP.film,
      icon: "film",
    },
    {
      key: "shows",
      label: "Shows finished",
      detail: `${counts.finishedShows.toLocaleString("en-GB")} × ${XP.finishedShow}`,
      count: counts.finishedShows,
      xp: counts.finishedShows * XP.finishedShow,
      icon: "check-check",
    },
    {
      key: "franchises",
      label: "Franchises completed",
      detail: `${counts.franchises.toLocaleString("en-GB")} × ${XP.franchise}`,
      count: counts.franchises,
      xp: counts.franchises * XP.franchise,
      icon: "boxes",
    },
    {
      key: "badges",
      label: "Badges earned",
      detail: `${counts.badges.toLocaleString("en-GB")} badge${
        counts.badges === 1 ? "" : "s"
      }, by tier`,
      count: counts.badges,
      xp: counts.badgeXp,
      icon: "award",
    },
    {
      key: "challenges",
      label: "Monthly challenges",
      detail: `${counts.challenges.toLocaleString("en-GB")} completed`,
      count: counts.challenges,
      xp: counts.challengeXp,
      icon: "target",
    },
    {
      key: "ratings",
      label: "Titles rated",
      detail: `${counts.ratings.toLocaleString("en-GB")} × ${XP.rating}`,
      count: counts.ratings,
      xp: counts.ratings * XP.rating,
      icon: "gauge",
    },
    {
      key: "reviews",
      label: "Reviews written",
      detail: `${counts.reviews.toLocaleString("en-GB")} × ${XP.review}`,
      count: counts.reviews,
      xp: counts.reviews * XP.review,
      icon: "pen-line",
    },
  ];
}

const total = (sources: XpSource[]) => sources.reduce((sum, source) => sum + source.xp, 0);

/**
 * Both totals, each from its own set of counts.
 *
 * Nothing is subtracted from anything here. Every source is asked twice — once
 * for what was earned on Trekker and once for the whole history — because that
 * is the only way the breakdown can be read as a sum rather than taken on
 * trust. Attribution per source:
 *
 * - **Plays** carry a `source`, so the split is exact.
 * - **Badges** carry `carried`, set when they unlock: a badge a years-old
 *   imported history satisfied on sight was not earned here, whether it was
 *   satisfied at the starting line or the day the achievement was written.
 * - **Challenges, ratings and reviews** cannot be imported at all, so every one
 *   of them was done here.
 * - **The two completion bonuses** are plain numbers with no history behind
 *   them, so what they stood at when the line was drawn is remembered and the
 *   Trekker figure counts only what has been finished since.
 */
export async function computeXp(userId: string) {
  const [plays, ratingCount, reviewCount, badges, challenges, account] = await Promise.all([
    db.play.groupBy({
      by: ["mediaType", "source"],
      where: { userId },
      _count: { _all: true },
    }),
    db.rating.count({ where: { userId } }),
    db.rating.count({ where: { userId, NOT: { review: null }, review: { not: "" } } }),
    db.unlockedAchievement.findMany({
      where: { userId },
      select: { key: true, carried: true },
    }),
    // The reward is read from the rows rather than from the catalogue: it was
    // fixed when the challenge was won, and retuning one later must not quietly
    // restate what somebody already earned.
    db.challengeRun.aggregate({ where: { userId }, _sum: { xp: true }, _count: true }),
    db.user.findUnique({
      where: { id: userId },
      select: {
        levelFinishedShows: true,
        levelFinishedFranchises: true,
        levelBaseShows: true,
        levelBaseFranchises: true,
        levelSyncedAt: true,
      },
    }),
  ]);

  let episodes = 0;
  let films = 0;
  let nativeEpisodes = 0;
  let nativeFilms = 0;

  for (const row of plays) {
    const n = row._count._all;
    const native = !IMPORTED_SOURCES.includes(row.source);

    if (row.mediaType === "tv") {
      episodes += n;
      if (native) nativeEpisodes += n;
    } else {
      films += n;
      if (native) nativeFilms += n;
    }
  }

  // A key no longer in the catalogue is worth nothing rather than crashing.
  const worth = (row: { key: string }) => {
    const tier = ACHIEVEMENTS_BY_ID.get(row.key)?.tier as Tier | undefined;
    return tier ? BADGE_XP[tier] : 0;
  };
  const known = badges.filter((row) => ACHIEVEMENTS_BY_ID.has(row.key));
  const earnedBadges = known.filter((row) => !row.carried);

  const finishedShows = account?.levelFinishedShows ?? 0;
  const franchises = account?.levelFinishedFranchises ?? 0;
  const baseShows = account?.levelBaseShows ?? 0;
  const baseFranchises = account?.levelBaseFranchises ?? 0;

  const challengeXp = challenges._sum.xp ?? 0;

  const trekkerSources = sourcesFor({
    episodes: nativeEpisodes,
    films: nativeFilms,
    finishedShows: Math.max(0, finishedShows - baseShows),
    franchises: Math.max(0, franchises - baseFranchises),
    badges: earnedBadges.length,
    badgeXp: earnedBadges.reduce((sum, row) => sum + worth(row), 0),
    challenges: challenges._count,
    challengeXp,
    ratings: ratingCount,
    reviews: reviewCount,
  });

  const lifetimeSources = sourcesFor({
    episodes,
    films,
    finishedShows,
    franchises,
    badges: known.length,
    badgeXp: known.reduce((sum, row) => sum + worth(row), 0),
    challenges: challenges._count,
    challengeXp,
    ratings: ratingCount,
    reviews: reviewCount,
  });

  return {
    trekker: { total: total(trekkerSources), sources: trekkerSources },
    lifetime: { total: total(lifetimeSources), sources: lifetimeSources },
    syncedAt: account?.levelSyncedAt ?? null,
  };
}

/**
 * Someone's level, and where the XP came from.
 *
 * Two numbers come out of this. The **level** is what has been earned since
 * Trekker started keeping the score, and everybody starts it at zero. The
 * **lifetime** level is the same history taken whole, imported years and all,
 * and it rides along beside the rank as a note.
 *
 * Everything here is a counted column — no TMDB, no per-title work — because
 * this runs on every profile render.
 */
export async function getLevel(userId: string): Promise<LevelState> {
  const { trekker, lifetime, syncedAt } = await computeXp(userId);

  const progress = levelFromXp(trekker.total);
  const lifetimeLevel = levelFromXp(lifetime.total);

  return {
    ...progress,
    sources: trekker.sources,
    next: nextRank(progress.level),
    lifetime: {
      level: lifetimeLevel.level,
      rank: rankFor(lifetimeLevel.level),
      xp: lifetime.total,
    },
    carriedXp: Math.max(0, lifetime.total - trekker.total),
    syncedAt,
  };
}

/**
 * Decides whether newly unlocked badges were earned here or came with the
 * history, and records the answer.
 *
 * An achievement the account has been measured against before and has only now
 * met was earned: something was watched to get there. One it has *never* been
 * measured against — because it was only just added to the catalogue — and which
 * a twenty-year history satisfies on sight was not. Without this, writing a new
 * achievement would hand every existing account XP for watching nothing, which
 * is exactly what adding the franchise badges did.
 *
 * Accounts with nothing imported are exempt: everything they have, they did here.
 */
export async function classifyUnlocks(
  userId: string,
  freshKeys: string[],
  allKeys: string[],
): Promise<Set<string>> {
  const [account, imported] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { levelKnownKeys: true } }),
    hasImportedHistory(userId),
  ]);

  const known = new Set((account?.levelKnownKeys ?? "").split(",").filter(Boolean));

  // Remember the whole catalogue as seen, whether or not anything unlocked, so
  // the next achievement added is the only thing that reads as new.
  if (allKeys.some((key) => !known.has(key))) {
    await db.user
      .update({ where: { id: userId }, data: { levelKnownKeys: allKeys.join(",") } })
      .catch(() => undefined);
  }

  if (!imported) return new Set();
  return new Set(freshKeys.filter((key) => !known.has(key)));
}

/**
 * Writes down the two counts the level cannot afford to work out on demand.
 *
 * Called from the achievements page, which has already paid for the TMDB lookups
 * behind them. Deliberately never called from the offline unlock check: that
 * pass cannot see what "finished" means and would write both back as zero.
 */
export async function syncLevelBonuses(
  userId: string,
  counts: { finishedShows: number; finishedFranchises: number },
  options: { partial?: boolean } = {},
) {
  const account = await db.user
    .findUnique({
      where: { id: userId },
      select: {
        levelFinishedShows: true,
        levelFinishedFranchises: true,
        levelBaseShows: true,
        levelBaseFranchises: true,
        levelBaselineAt: true,
      },
    })
    .catch(() => null);
  if (!account) return;

  let { finishedShows, finishedFranchises } = counts;

  // A first visit with a long history has not looked up every title yet, so
  // franchises in particular read low. While that is still true the counts may
  // only go up: a level that dropped because a cache was still filling would
  // look like the app taking something back.
  if (options.partial) {
    finishedShows = Math.max(finishedShows, account.levelFinishedShows);
    finishedFranchises = Math.max(finishedFranchises, account.levelFinishedFranchises);
  }

  const imported = await hasImportedHistory(userId);

  let baseShows = account.levelBaseShows;
  let baseFranchises = account.levelBaseFranchises;

  if (imported && (account.levelBaselineAt === null || options.partial)) {
    // Still settling: whatever these come out at is the history's doing, not
    // anything watched here, so the starting line moves with them. Once every
    // title has been looked up the line stops moving and finishing a show
    // genuinely counts.
    baseShows = Math.max(baseShows, finishedShows);
    baseFranchises = Math.max(baseFranchises, finishedFranchises);
  }

  await db.user
    .update({
      where: { id: userId },
      data: {
        levelFinishedShows: finishedShows,
        levelFinishedFranchises: finishedFranchises,
        levelBaseShows: baseShows,
        levelBaseFranchises: baseFranchises,
        levelSyncedAt: new Date(),
        levelBaselineAt: account.levelBaselineAt ?? new Date(),
      },
    })
    .catch(() => undefined);
}

/**
 * Absorbs an import: everything it brought in belongs to the history, not to
 * the level.
 *
 * The plays take care of themselves — they carry their source. This marks the
 * badges the import unlocked as carried, and puts the completion bonuses back on
 * the starting line by asking for them to be worked out afresh.
 */
export async function absorbImport(userId: string, unlockedDuring: string[]) {
  if (unlockedDuring.length > 0) {
    await db.unlockedAchievement
      .updateMany({
        where: { userId, key: { in: unlockedDuring } },
        data: { carried: true },
      })
      .catch(() => undefined);
  }

  // `levelSyncedAt: null` makes the next achievements page treat the completion
  // counts as unestablished, which is what moves the starting line up to
  // whatever the imported history turns out to have finished.
  await db.user
    .update({ where: { id: userId }, data: { levelSyncedAt: null } })
    .catch(() => undefined);
}
