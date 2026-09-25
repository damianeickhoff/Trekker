import "server-only";
import { db } from "../db";
import {
  CHALLENGES_BY_ID,
  challengesFor,
  evaluate,
  periodKey,
  progressLabel,
  type ChallengeIcon,
  type ChallengeProgress,
  type ChallengeWindow,
  type TitleFacts,
} from "./catalogue";

export { challengesFor, periodKey } from "./catalogue";

/**
 * One month of viewing and just enough about the titles in it: four indexed
 * reads, no network. The month runs in server time, which for a self-hosted
 * instance is the household's.
 */
export async function challengeWindow(userId: string, now: Date): Promise<ChallengeWindow> {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [plays, ratings, before] = await Promise.all([
    // (userId, watchedAt)
    db.play.findMany({
      where: { userId, watchedAt: { gte: from, lt: to } },
      select: { mediaType: true, tmdbId: true, seasonNumber: true, episodeNumber: true, runtime: true, watchedAt: true },
      orderBy: { watchedAt: "asc" },
    }),
    // (userId, ...) unique, then a range on a handful of rows
    db.rating.findMany({ where: { userId, updatedAt: { gte: from, lt: to } }, select: { review: true } }),
    // (userId, mediaType, tmdbId, watchedAt)
    db.play.findMany({
      where: { userId, mediaType: "tv", watchedAt: { lt: from } },
      select: { tmdbId: true },
      distinct: ["tmdbId"],
    }),
  ]);

  const typed = plays.map((p) => ({ ...p, mediaType: p.mediaType === "tv" ? ("tv" as const) : ("movie" as const) }));
  const ids = (type: "movie" | "tv") => [...new Set(typed.filter((p) => p.mediaType === type).map((p) => p.tmdbId))];
  const movieIds = ids("movie");
  const showIds = ids("tv");

  // (mediaType, tmdbId) unique
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
          select: { mediaType: true, tmdbId: true, genres: true, originalLanguage: true, releaseDate: true, runtime: true },
        });

  const facts = new Map<string, TitleFacts>();
  for (const m of meta) {
    const year = m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : NaN;
    facts.set(`${m.mediaType}-${m.tmdbId}`, {
      genres: m.genres.split(",").filter(Boolean),
      originalLanguage: m.originalLanguage,
      year: Number.isFinite(year) ? year : null,
      runtime: m.runtime,
    });
  }

  return {
    plays: typed,
    facts,
    ratings,
    showsBefore: new Set(before.map((b) => b.tmdbId)),
    year: now.getFullYear(),
  };
}

/** This month's progress, as plain numbers: what the Home cache holds. */
export async function measureMonth(userId: string, now: Date): Promise<ChallengeProgress[]> {
  return evaluate(await challengeWindow(userId, now), challengesFor(now));
}

export type ChallengeCard = {
  id: string;
  name: string;
  icon: ChallengeIcon;
  short: string;
  description: string;
  label: string;
  percent: number;
  xp: number;
  done: boolean;
};

export type MonthlyChallenges = {
  period: string;
  /** "September". */
  month: string;
  cards: ChallengeCard[];
  open: number;
  /** What the three are worth together this month, and what has been won of it. */
  totalXp: number;
  earnedXp: number;
  /** Whole days left, today included. */
  daysLeft: number;
};

/**
 * The strip: progress (however it was measured) joined to what has been won
 * this month, with anything newly finished written down.
 *
 * A finished challenge stays finished: the run is what pays the XP, and a
 * play deleted later in the month does not take back something already won.
 * Writing it here rather than in `recordPlay` keeps the play path free of the
 * catalogue; the strip is where a finish is noticed, and a finish nobody looks
 * at is written on the next look.
 */
export async function monthlyChallenges(
  userId: string,
  now: Date,
  progress: ChallengeProgress[],
): Promise<MonthlyChallenges> {
  const period = periodKey(now);
  const runs = await db.challengeRun.findMany({ where: { userId, period }, select: { key: true, xp: true } });
  const won = new Map(runs.map((r) => [r.key, r.xp]));

  const cards: ChallengeCard[] = [];
  for (const { id, progress: value } of progress) {
    const challenge = CHALLENGES_BY_ID.get(id);
    if (!challenge) continue;
    const finished = value >= challenge.target;
    if (finished && !won.has(id)) {
      await db.challengeRun
        .upsert({
          where: { userId_key_period: { userId, key: id, period } },
          create: { userId, key: id, period, xp: challenge.xp },
          update: {},
        })
        .catch(() => undefined);
      won.set(id, challenge.xp);
    }
    const done = finished || won.has(id);
    cards.push({
      id,
      name: challenge.name,
      icon: challenge.icon,
      short: challenge.short,
      description: challenge.description,
      label: progressLabel(challenge, done ? challenge.target : value),
      percent: done ? 100 : Math.min(99, Math.floor((value / challenge.target) * 100)),
      xp: won.get(id) ?? challenge.xp,
      done,
    });
  }

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    period,
    month: now.toLocaleDateString("en-GB", { month: "long" }),
    cards,
    open: cards.filter((c) => !c.done).length,
    totalXp: cards.reduce((sum, c) => sum + c.xp, 0),
    earnedXp: cards.reduce((sum, c) => sum + (c.done ? c.xp : 0), 0),
    daysLeft: Math.max(1, Math.round((endOfMonth.getTime() - startOfToday.getTime()) / 86_400_000)),
  };
}
