import "server-only";
import { db } from "./db";

/**
 * "What did I watch?" over a window — a year, or a month.
 *
 * Everything is computed from rows the user already owns, so this costs one
 * pair of queries and no TMDB calls at all.
 */

export type ReviewPeriod = "year" | "month";

export type ReviewData = {
  label: string;
  from: Date;
  to: Date;
  totalMinutes: number;
  movieCount: number;
  episodeCount: number;
  showCount: number;
  /** Longest run of consecutive days with something logged. */
  streak: number;
  /** Most episodes logged on any one day, with the day itself. */
  biggestDay: { date: Date; count: number } | null;
  topShows: { showId: number; name: string; poster: string | null; minutes: number }[];
  topMovies: { movieId: number; title: string; poster: string | null; score: number | null }[];
  /** Minutes per bucket: months for a year, days for a month. */
  buckets: { label: string; minutes: number }[];
};

/**
 * Which months can be recapped: January of this year up to the month just
 * gone. The month in progress is excluded on purpose — a recap of a
 * half-finished month is a progress bar, and reads as a disappointment either
 * way. Empty in January, when there is no completed month yet.
 */
export function selectableMonths(now = new Date()): string[] {
  const months: string[] = [];
  for (let month = 0; month < now.getMonth(); month += 1) {
    months.push(`${now.getFullYear()}-${String(month + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Parses `YYYY-MM`, refusing anything outside the selectable range. */
export function resolveMonth(value: string | undefined, now = new Date()): string | null {
  const months = selectableMonths(now);
  if (months.length === 0) return null;
  if (value && months.includes(value)) return value;
  // Default to the most recent completed month.
  return months[months.length - 1];
}

export function periodRange(period: ReviewPeriod, month?: string | null, now = new Date()) {
  if (period === "month") {
    const resolved = resolveMonth(month ?? undefined, now);
    if (!resolved) {
      // Nothing to show: an empty range, so every total comes out at zero.
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: start, label: "No completed month yet" };
    }

    const [year, index] = resolved.split("-").map(Number);
    const from = new Date(year, index - 1, 1);
    const to = new Date(year, index, 1);
    return {
      from,
      to,
      label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }

  const from = new Date(now.getFullYear(), 0, 1);
  const to = new Date(now.getFullYear() + 1, 0, 1);
  return { from, to, label: String(now.getFullYear()) };
}

export async function getReview(
  userId: string,
  period: ReviewPeriod,
  month?: string | null,
): Promise<ReviewData> {
  const { from, to, label } = periodRange(period, month);

  // A recap is a record of a year as it was lived, so it counts viewings: an
  // evening spent on a favourite for the third time was still that evening.
  const plays = await db.play.findMany({
    where: { userId, watchedAt: { gte: from, lt: to } },
    orderBy: { watchedAt: "asc" },
  });

  const movies = plays.filter((p) => p.mediaType === "movie");
  const episodes = plays.filter((p) => p.mediaType === "tv");

  const totalMinutes = plays.reduce((sum, p) => sum + p.runtime, 0);

  // ---- Shows ---------------------------------------------------------------
  const byShow = new Map<number, { name: string; poster: string | null; minutes: number }>();
  for (const e of episodes) {
    const entry = byShow.get(e.tmdbId) ?? {
      name: e.title,
      poster: e.poster,
      minutes: 0,
    };
    entry.minutes += e.runtime;
    byShow.set(e.tmdbId, entry);
  }

  const topShows = [...byShow.entries()]
    .map(([showId, show]) => ({ showId, ...show }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // ---- Days ----------------------------------------------------------------
  const perDay = new Map<string, number>();
  for (const entry of plays) {
    const key = dayKey(entry.watchedAt);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const days = [...perDay.keys()].sort();
  let streak = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of days) {
    run = previous && isNextDay(previous, day) ? run + 1 : 1;
    previous = day;
    streak = Math.max(streak, run);
  }

  const biggest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];

  // ---- Films ---------------------------------------------------------------
  // Newest first, one entry per film: without the dedupe a favourite watched
  // four times in a year would take four of the six poster slots and crowd out
  // everything else the year had in it.
  const recentFilms: typeof movies = [];
  const seen = new Set<number>();
  for (let i = movies.length - 1; i >= 0 && recentFilms.length < 6; i--) {
    if (seen.has(movies[i].tmdbId)) continue;
    seen.add(movies[i].tmdbId);
    recentFilms.push(movies[i]);
  }

  // Scores live on the title, not the viewing, so they come from the other side.
  const scores = new Map(
    (
      await db.watchedMovie.findMany({
        where: { userId, movieId: { in: recentFilms.map((m) => m.tmdbId) } },
        select: { movieId: true, score: true },
      })
    ).map((row) => [row.movieId, row.score]),
  );

  // ---- Buckets -------------------------------------------------------------
  const buckets = period === "year" ? yearBuckets(from, plays) : monthBuckets(from, to, plays);

  return {
    label,
    from,
    to,
    totalMinutes,
    movieCount: movies.length,
    episodeCount: episodes.length,
    showCount: byShow.size,
    streak,
    biggestDay: biggest
      ? { date: new Date(`${biggest[0]}T12:00:00`), count: biggest[1] }
      : null,
    topShows,
    topMovies: recentFilms.map((m) => ({
      movieId: m.tmdbId,
      title: m.title,
      poster: m.poster,
      score: scores.get(m.tmdbId) ?? null,
    })),
    buckets,
  };
}

type Timed = { watchedAt: Date; runtime: number };

function yearBuckets(from: Date, plays: Timed[]) {
  const minutes = new Array(12).fill(0);
  for (const entry of plays) {
    minutes[entry.watchedAt.getMonth()] += entry.runtime;
  }

  return minutes.map((value, month) => ({
    label: new Date(from.getFullYear(), month, 1).toLocaleString("en", { month: "narrow" }),
    minutes: value,
  }));
}

function monthBuckets(from: Date, to: Date, plays: Timed[]) {
  const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  const minutes = new Array(days).fill(0);

  for (const entry of plays) {
    const index = entry.watchedAt.getDate() - 1;
    if (index >= 0 && index < days) minutes[index] += entry.runtime;
  }

  return minutes.map((value, day) => ({ label: String(day + 1), minutes: value }));
}

/** Local calendar day, so "what did I watch on Tuesday" means the user's Tuesday. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function isNextDay(previous: string, current: string) {
  const before = new Date(`${previous}T12:00:00`);
  before.setDate(before.getDate() + 1);
  return dayKey(before) === current;
}
