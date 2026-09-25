import "server-only";
import { db } from "../db";
import { BADGE_XP, XP, levelFromXp, type LevelProgress } from "../levels";
import { ACHIEVEMENTS_BY_ID } from "./catalogue";

/**
 * Where the XP comes from, attributed source by source so the level is a sum
 * that can be checked rather than a number the app decided on.
 *
 * Everybody starts at level 0: nothing that arrived with an imported history
 * counts. Nothing is subtracted to achieve that; each source knows its own
 * origin. Plays carry a `source`, so the split is exact. Badges carry
 * `carried`, decided as they unlock. Challenges, ratings and reviews cannot be
 * imported, so all of them were done here. The two completion bonuses are
 * plain numbers with no history behind them, so what they stood at when the
 * line was drawn is kept on the account and only what has been finished since
 * counts. The whole history, imports included, is the lifetime figure.
 *
 * Every read here is a count or a grouped count over an index, cheap enough
 * for the bell's cached answer and the profile hero.
 */

/**
 * Raised whenever the level's arithmetic changes, so a level cached under the
 * old rules is never served (the bell's key carries it). 2: badges the
 * imported history alone meets are carried, however late their facts arrive.
 */
export const LEVEL_RULES = 2;

/** Play sources that came from somewhere else rather than from using Trekker. */
export const IMPORTED_SOURCES = ["trakt", "backfill"];

export type Level = LevelProgress & {
  /** The whole history taken together, imported years and all. */
  lifetime: LevelProgress;
  badges: number;
};

export async function hasImportedHistory(userId: string) {
  return (await db.play.count({ where: { userId, source: { in: IMPORTED_SOURCES } } })) > 0;
}

export async function computeXp(userId: string) {
  const [plays, ratings, reviews, badges, challenges, account] = await Promise.all([
    db.play.groupBy({ by: ["mediaType", "source"], where: { userId }, _count: { _all: true } }),
    db.rating.count({ where: { userId } }),
    db.rating.count({ where: { userId, AND: [{ review: { not: null } }, { review: { not: "" } }] } }),
    db.unlockedAchievement.findMany({ where: { userId }, select: { key: true, carried: true } }),
    // The reward on the row, not the catalogue's: it was fixed when it was won.
    db.challengeRun.aggregate({ where: { userId }, _sum: { xp: true }, _count: { _all: true } }),
    db.user.findUnique({
      where: { id: userId },
      select: {
        levelFinishedShows: true,
        levelFinishedFranchises: true,
        levelBaseShows: true,
        levelBaseFranchises: true,
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

  // A key no longer in the catalogue is worth nothing rather than an error.
  const known = badges.filter((b) => ACHIEVEMENTS_BY_ID.has(b.key));
  const worth = (key: string) => BADGE_XP[ACHIEVEMENTS_BY_ID.get(key)!.tier];
  const allBadgeXp = known.reduce((sum, b) => sum + worth(b.key), 0);
  const earnedBadgeXp = known.filter((b) => !b.carried).reduce((sum, b) => sum + worth(b.key), 0);

  const shows = account?.levelFinishedShows ?? 0;
  const franchises = account?.levelFinishedFranchises ?? 0;
  const shared = (challenges._sum.xp ?? 0) + ratings * XP.rating + reviews * XP.review;

  const trekker =
    nativeEpisodes * XP.episode +
    nativeFilms * XP.film +
    Math.max(0, shows - (account?.levelBaseShows ?? 0)) * XP.finishedShow +
    Math.max(0, franchises - (account?.levelBaseFranchises ?? 0)) * XP.franchise +
    earnedBadgeXp +
    shared;
  const lifetime =
    episodes * XP.episode + films * XP.film + shows * XP.finishedShow + franchises * XP.franchise + allBadgeXp + shared;

  // The same terms as `trekker`, one per row of the badges page's breakdown,
  // so the rows always add up to the level they explain.
  const showsHere = Math.max(0, shows - (account?.levelBaseShows ?? 0));
  const franchisesHere = Math.max(0, franchises - (account?.levelBaseFranchises ?? 0));
  const earnedBadges = known.filter((b) => !b.carried).length;
  const sources: XpSource[] = [
    { key: "episodes", label: "Episodes watched", count: nativeEpisodes, rate: XP.episode, xp: nativeEpisodes * XP.episode },
    { key: "films", label: "Films watched", count: nativeFilms, rate: XP.film, xp: nativeFilms * XP.film },
    { key: "shows", label: "Shows finished", count: showsHere, rate: XP.finishedShow, xp: showsHere * XP.finishedShow },
    { key: "franchises", label: "Franchises completed", count: franchisesHere, rate: XP.franchise, xp: franchisesHere * XP.franchise },
    { key: "badges", label: "Badges earned", count: earnedBadges, rate: null, xp: earnedBadgeXp },
    { key: "challenges", label: "Monthly challenges", count: challenges._count._all, rate: null, xp: challenges._sum.xp ?? 0 },
    { key: "ratings", label: "Titles rated", count: ratings, rate: XP.rating, xp: ratings * XP.rating },
    { key: "reviews", label: "Reviews written", count: reviews, rate: XP.review, xp: reviews * XP.review },
  ];

  return { trekker, lifetime, badges: known.length, sources };
}

/**
 * One row of the breakdown: how many, what each is worth (null where it
 * varies: badges by tier, challenges by what each paid), and the XP.
 */
export type XpSource = { key: string; label: string; count: number; rate: number | null; xp: number };

/** The badges page's level: the level and the lifetime level, with where the XP came from. */
export async function getLevelBreakdown(userId: string): Promise<Level & { sources: XpSource[] }> {
  const { trekker, lifetime, badges, sources } = await computeXp(userId);
  return { ...levelFromXp(trekker), lifetime: levelFromXp(lifetime), badges, sources };
}

/** Someone's level, and the lifetime level beside it. */
export async function getLevel(userId: string): Promise<Level> {
  const { trekker, lifetime, badges } = await computeXp(userId);
  return { ...levelFromXp(trekker), lifetime: levelFromXp(lifetime), badges };
}

/**
 * Which of the badges just reached came with the history rather than being
 * earned here, remembering the whole catalogue as measured on the way.
 *
 * A badge the history alone meets (`metByHistory`: measured over the imported
 * plays and those before the starting line, see `snapshot.ts`) is carried,
 * whenever it is first noticed. Being measured before is no proof of having
 * earned it: the badges read title facts that arrive a few at a time, so an
 * old history keeps meeting genre and franchise badges for days after it
 * lands, and each of those used to pay as if something had just been watched.
 * One the account was never measured against, because it is new to the
 * catalogue, is carried too, so adding a badge never hands out XP for
 * watching nothing. Accounts with nothing imported are exempt: everything they
 * have, they did here.
 */
export async function classifyUnlocks(
  userId: string,
  fresh: string[],
  allKeys: string[],
  metByHistory: Set<string>,
): Promise<Set<string>> {
  const [account, imported] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { levelKnownKeys: true } }),
    hasImportedHistory(userId),
  ]);
  const known = new Set((account?.levelKnownKeys ?? "").split(",").filter(Boolean));
  if (allKeys.some((k) => !known.has(k))) {
    await db.user.update({ where: { id: userId }, data: { levelKnownKeys: allKeys.join(",") } }).catch(() => undefined);
  }
  if (!imported) return new Set();
  return new Set(fresh.filter((k) => !known.has(k) || metByHistory.has(k)));
}

/**
 * The two counts the level cannot work out on demand, written down by the
 * badges page, which has just worked them out. While titles are still being
 * looked up they may only rise: a level that fell because a cache was filling
 * would look like the app taking something back. With an imported history the
 * starting line moves with them until the lookups settle, since whatever they
 * come to by then is the history's doing, and it never stands below what the
 * history alone completes (`history`): a franchise whose last film's facts
 * arrive a week after the line was drawn was still finished before it.
 */
export async function syncLevelBonuses(
  userId: string,
  counts: { finishedShows: number; finishedFranchises: number },
  { partial = false, history }: { partial?: boolean; history?: { finishedShows: number; finishedFranchises: number } } = {},
) {
  const account = await db.user.findUnique({
    where: { id: userId },
    select: {
      levelFinishedShows: true,
      levelFinishedFranchises: true,
      levelBaseShows: true,
      levelBaseFranchises: true,
      levelBaselineAt: true,
    },
  });
  if (!account) return;

  let { finishedShows, finishedFranchises } = counts;
  if (partial) {
    finishedShows = Math.max(finishedShows, account.levelFinishedShows);
    finishedFranchises = Math.max(finishedFranchises, account.levelFinishedFranchises);
  }

  let baseShows = account.levelBaseShows;
  let baseFranchises = account.levelBaseFranchises;
  const imported = await hasImportedHistory(userId);
  if ((account.levelBaselineAt === null || partial) && imported) {
    baseShows = Math.max(baseShows, finishedShows);
    baseFranchises = Math.max(baseFranchises, finishedFranchises);
  }
  if (history && imported) {
    baseShows = Math.max(baseShows, history.finishedShows);
    baseFranchises = Math.max(baseFranchises, history.finishedFranchises);
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
