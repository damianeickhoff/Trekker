import "server-only";
import { db } from "../db";
import {
  CHALLENGES_BY_ID,
  challengesFor,
  monthName,
  periodKey,
  type Challenge,
  type ChallengeWindow,
} from "./catalogue";

export { CHALLENGES, CHALLENGES_BY_ID, challengesFor, monthName, periodKey } from "./catalogue";

export type ChallengeState = {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  percent: number;
  /** Reads as "12 / 20", or "8h / 25h" for the time-based ones. */
  label: string;
  xp: number;
  done: boolean;
  completedAt: Date | null;
};

export type MonthlyChallenges = {
  /** "2026-08". */
  period: string;
  /** "August 2026". */
  monthLabel: string;
  challenges: ChallengeState[];
  doneCount: number;
  /** XP won this month. */
  earnedXp: number;
  /** XP still on the table. */
  remainingXp: number;
  /** Whole days left, today included. */
  daysLeft: number;
};

function formatUnit(value: number, unit: Challenge["unit"]) {
  if (unit !== "minutes") return value.toLocaleString("en-GB");
  return `${Math.round(value / 60).toLocaleString("en-GB")}h`;
}

/**
 * One month of viewing, and just enough about the titles in it to judge the
 * genre, language and age challenges.
 *
 * Four indexed reads and no network: this has to be cheap, because the bar it
 * feeds sits at the top of the dashboard.
 */
async function buildWindow(userId: string, month: Date): Promise<ChallengeWindow> {
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const [plays, ratings, before] = await Promise.all([
    db.play.findMany({
      where: { userId, watchedAt: { gte: from, lt: to } },
      select: {
        mediaType: true,
        tmdbId: true,
        title: true,
        seasonNumber: true,
        episodeNumber: true,
        runtime: true,
        watchedAt: true,
      },
      orderBy: { watchedAt: "asc" },
    }),
    db.rating.findMany({
      where: { userId, updatedAt: { gte: from, lt: to } },
      select: { score: true, review: true },
    }),
    // "Shows you had never watched before" needs to know what came earlier.
    db.play.findMany({
      where: { userId, mediaType: "tv", watchedAt: { lt: from } },
      select: { tmdbId: true },
      distinct: ["tmdbId"],
    }),
  ]);

  const typed = plays.map((play) => ({
    ...play,
    mediaType: play.mediaType === "tv" ? ("tv" as const) : ("movie" as const),
  }));

  const movieIds = [...new Set(typed.filter((p) => p.mediaType === "movie").map((p) => p.tmdbId))];
  const showIds = [...new Set(typed.filter((p) => p.mediaType === "tv").map((p) => p.tmdbId))];

  const meta =
    movieIds.length + showIds.length === 0
      ? []
      : await db.titleMeta.findMany({
          where: {
            OR: [
              { mediaType: "movie", tmdbId: { in: movieIds } },
              { mediaType: "tv", tmdbId: { in: showIds } },
            ],
          },
        });

  const facts: ChallengeWindow["facts"] = new Map();
  for (const row of meta) {
    const year = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : NaN;
    facts.set(`${row.mediaType}-${row.tmdbId}`, {
      genres: row.genres ? row.genres.split(",").filter(Boolean) : [],
      originalLanguage: row.originalLanguage,
      year: Number.isFinite(year) ? year : null,
      runtime: row.runtime,
    });
  }

  return {
    plays: typed,
    facts,
    ratings,
    showsBefore: new Set(before.map((row) => row.tmdbId)),
    year: month.getFullYear(),
    month: month.getMonth(),
  };
}

/**
 * This month's three challenges, how far along each is, and anything finished
 * written down on the way past.
 *
 * A finished challenge stays finished: the row is what pays the XP, and a
 * deleted play later in the month cannot take back something already won.
 */
export async function getMonthlyChallenges(
  userId: string,
  now: Date = new Date(),
): Promise<MonthlyChallenges> {
  const period = periodKey(now);
  const active = challengesFor(now);

  const [window, runs] = await Promise.all([
    buildWindow(userId, now),
    db.challengeRun.findMany({ where: { userId, period } }),
  ]);

  const done = new Map(runs.map((run) => [run.key, run]));
  const fresh: { key: string; xp: number }[] = [];

  const challenges = active.map((challenge) => {
    const raw = Math.max(0, Math.round(challenge.measure(window)));
    const progress = Math.min(raw, challenge.target);
    const already = done.get(challenge.id) ?? null;

    if (progress >= challenge.target && !already) {
      fresh.push({ key: challenge.id, xp: challenge.xp });
    }

    const complete = progress >= challenge.target || already !== null;

    return {
      id: challenge.id,
      name: challenge.name,
      description: challenge.description,
      icon: challenge.icon,
      progress,
      target: challenge.target,
      percent: complete
        ? 100
        : Math.min(99, Math.floor((progress / challenge.target) * 100)),
      label: `${formatUnit(progress, challenge.unit)} / ${formatUnit(
        challenge.target,
        challenge.unit,
      )}`,
      xp: already?.xp ?? challenge.xp,
      done: complete,
      completedAt: already?.completedAt ?? null,
    } satisfies ChallengeState;
  });

  if (fresh.length > 0) {
    const at = new Date();
    await db.challengeRun
      .createMany({
        data: fresh.map((entry) => ({ userId, key: entry.key, period, xp: entry.xp, completedAt: at })),
      })
      .catch(() => undefined);

    for (const state of challenges) {
      if (fresh.some((entry) => entry.key === state.id)) state.completedAt = at;
    }
  }

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysLeft = Math.max(
    1,
    Math.ceil((endOfMonth.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000),
  );

  return {
    period,
    monthLabel: monthName(now),
    challenges,
    doneCount: challenges.filter((c) => c.done).length,
    earnedXp: challenges.filter((c) => c.done).reduce((sum, c) => sum + c.xp, 0),
    remainingXp: challenges.filter((c) => !c.done).reduce((sum, c) => sum + c.xp, 0),
    daysLeft,
  };
}

/**
 * Records anything finished without drawing the bar — the same evaluation with
 * the reporting stripped out, so tracking an episode can award a challenge
 * before anyone goes looking at it.
 */
export async function syncChallenges(userId: string): Promise<string[]> {
  const now = new Date();
  const period = periodKey(now);

  const [window, runs] = await Promise.all([
    buildWindow(userId, now),
    db.challengeRun.findMany({ where: { userId, period }, select: { key: true } }),
  ]);

  const known = new Set(runs.map((run) => run.key));
  const fresh = challengesFor(now).filter(
    (challenge) =>
      !known.has(challenge.id) &&
      Math.round(challenge.measure(window)) >= challenge.target,
  );

  if (fresh.length === 0) return [];

  await db.challengeRun
    .createMany({
      data: fresh.map((challenge) => ({
        userId,
        key: challenge.id,
        period,
        xp: challenge.xp,
      })),
    })
    .catch(() => undefined);

  return fresh.map((challenge) => challenge.id);
}

/** Total challenge XP someone has ever won, for the level's breakdown. */
export async function challengeXp(userId: string) {
  const [sum, count] = await Promise.all([
    db.challengeRun.aggregate({ where: { userId }, _sum: { xp: true } }),
    db.challengeRun.count({ where: { userId } }),
  ]);
  return { xp: sum._sum.xp ?? 0, count };
}

/** A finished challenge's definition, for the notification centre. */
export function challengeById(key: string) {
  return CHALLENGES_BY_ID.get(key) ?? null;
}
