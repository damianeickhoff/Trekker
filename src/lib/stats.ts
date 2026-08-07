import "server-only";
import { db } from "./db";
import { rangeFilter, type Range } from "./range";
import { getScore, tmdbConfigured } from "./tmdb";
import { getShowCompletion, type ShowState } from "./continue-watching";
import type { WatchStatus } from "@/components/media-card";

export type Stats = {
  movieMinutes: number;
  tvMinutes: number;
  totalMinutes: number;
  /** Viewings, not titles — a film seen twice is two. */
  movieCount: number;
  episodeCount: number;
  /** Distinct films, for "(N different)" beside the count above. */
  distinctMovies: number;
  showCount: number;
  last30Minutes: number;
  /** Minutes per elapsed day inside the window — comparable across ranges. */
  dailyAverage: number;
  /**
   * The line chart's points, oldest → newest. What one point *is* depends on
   * the window: days inside a month, months inside a year, years across all of
   * it. Twelve points for a decade or three hundred for a month would each be
   * unreadable in their own way.
   */
  series: { label: string; minutes: number }[];
  /**
   * Whether the final point is a bucket still being filled — today's day,
   * this month, this year. It is what the chart's marker means: "you are here".
   *
   * A finished window has no such point, which is why this can be false. "Last
   * year" ended in December and nothing more will land in it, so marking one of
   * its months would be pointing at nothing.
   */
  seriesLive: boolean;
  /**
   * Minutes per day of the week, Monday first. Monday rather than Sunday
   * because a weekend that reads as two columns at the end is the shape people
   * actually think in — `getDay()` puts Sunday at index 0 and splits it.
   */
  weekday: { label: string; minutes: number }[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * How much has been watched, and how often.
 *
 * Time comes from the play log, so a film seen three times is three sittings of
 * it. The counts beside those totals are viewings too, deliberately: a distinct
 * title count sitting under a minute total that includes rewatches reads as an
 * arithmetic mistake, whichever way round you put it. "How many *different*
 * films" is a question about a collection, and `distinctMovies` answers it
 * separately — as does `showCount`, which is only ever a collection question.
 */
export async function getStats(userId: string, range?: Range): Promise<Stats> {
  const [plays, distinctMovies, shows, span] = await Promise.all([
    db.play.findMany({
      where: { userId, ...(range ? rangeFilter(range) : {}) },
      select: { mediaType: true, runtime: true, watchedAt: true },
    }),
    // Collection counts follow the window too: "12 different films" alongside
    // "this month" has to mean twelve films this month.
    range
      ? db.play
          .findMany({
            where: { userId, mediaType: "movie", ...rangeFilter(range) },
            select: { tmdbId: true },
            distinct: ["tmdbId"],
          })
          .then((rows) => rows.length)
      : db.watchedMovie.count({ where: { userId } }),
    range
      ? db.play.findMany({
          where: { userId, mediaType: "tv", ...rangeFilter(range) },
          select: { tmdbId: true },
          distinct: ["tmdbId"],
        })
      : db.watchedEpisode.findMany({
          where: { userId },
          select: { showId: true },
          distinct: ["showId"],
        }),
    // How far back the history goes — the axis for "all time", and the divisor
    // for its daily average.
    db.play.aggregate({
      where: { userId },
      _min: { watchedAt: true },
      _max: { watchedAt: true },
    }),
  ]);

  let movieMinutes = 0;
  let tvMinutes = 0;
  let movieCount = 0;
  let episodeCount = 0;
  let last30Minutes = 0;
  const weekday = new Array(7).fill(0) as number[];

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const { keyOf, points, live } = seriesShape(range, span);
  const buckets = new Map<string, number>(points.map((p) => [p.key, 0]));

  for (const play of plays) {
    if (play.mediaType === "movie") {
      movieMinutes += play.runtime;
      movieCount += 1;
    } else {
      tvMinutes += play.runtime;
      episodeCount += 1;
    }

    if (play.watchedAt.getTime() >= cutoff) last30Minutes += play.runtime;

    // `getDay()` is Sunday-first; this rotates it so Monday is 0.
    weekday[(play.watchedAt.getDay() + 6) % 7] += play.runtime;

    const key = keyOf(play.watchedAt);
    if (buckets.has(key)) buckets.set(key, buckets.get(key)! + play.runtime);
  }

  return {
    dailyAverage: Math.round((movieMinutes + tvMinutes) / elapsedDays(range, span)),
    series: points.map((p) => ({ label: p.label, minutes: buckets.get(p.key) ?? 0 })),
    seriesLive: live,
    movieMinutes,
    tvMinutes,
    totalMinutes: movieMinutes + tvMinutes,
    movieCount,
    episodeCount,
    distinctMovies,
    showCount: shows.length,
    last30Minutes,
    weekday: WEEKDAYS.map((label, i) => ({ label, minutes: weekday[i] })),
  };
}

type Span = { _min: { watchedAt: Date | null }; _max: { watchedAt: Date | null } } | null;

/**
 * The buckets the chart will be drawn from, and the function that decides which
 * one a play falls into. Built up front and pre-seeded with zeroes so a quiet
 * month still occupies its place on the axis rather than closing the gap.
 *
 * Nothing past today is ever emitted. A quiet month is a real zero and belongs
 * on the axis; a month that has not happened is not a zero, and drawing it as
 * one dragged the curve to the floor for the rest of the year and left the
 * chart claiming a August reader was somewhere in December.
 *
 * `live` says whether the last bucket is still being filled, which is what the
 * marker means. A window that closed in the past — "last year" — has no such
 * bucket and gets no marker.
 */
function seriesShape(range: Range | undefined, span: Span) {
  const now = new Date();

  // No window asked for: the rolling twelve months, which is what the home
  // page and the friend profiles have always shown.
  if (!range) {
    const points = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      points.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString("en-GB", { month: "short" }),
      });
    }
    return { keyOf: monthKey, points, live: true };
  }

  if (range.buckets === "day") {
    const start = range.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const end = range.to ?? now;
    const points = [];
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      points.push({ key: dayKey(cursor), label: String(cursor.getDate()) });
    }
    // Open-ended windows run to today, so the last day is today's.
    return { keyOf: dayKey, points, live: range.to === null };
  }

  if (range.buckets === "month") {
    const year = (range.from ?? now).getFullYear();
    return { keyOf: monthKey, ...monthsOf(year, now) };
  }

  // All time. One point per year of history — and if that is a single year,
  // its months instead, because a chart with one point is not a chart.
  const first = span?._min.watchedAt?.getFullYear() ?? now.getFullYear();
  const last = span?._max.watchedAt?.getFullYear() ?? now.getFullYear();

  if (first === last) {
    return { keyOf: monthKey, ...monthsOf(first, now) };
  }

  const points = [];
  for (let y = first; y <= last; y++) points.push({ key: String(y), label: String(y) });

  return {
    keyOf: (date: Date) => String(date.getFullYear()),
    points,
    live: last === now.getFullYear(),
  };
}

/**
 * A year's months, stopping at the present one when the year is the current
 * one. A year already over gets all twelve and no marker.
 */
function monthsOf(year: number, now: Date) {
  const current = year === now.getFullYear();
  const months = current ? now.getMonth() + 1 : 12;
  const points = [];

  for (let m = 0; m < months; m++) {
    const d = new Date(year, m, 1);
    points.push({ key: `${year}-${m}`, label: d.toLocaleString("en-GB", { month: "short" }) });
  }

  return { points, live: current };
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

/**
 * Days the window has actually covered, for the daily average. A window that has
 * only just started must not divide by its whole length — three hours on the
 * first of the month is three hours a day so far, not six minutes.
 */
function elapsedDays(range: Range | undefined, span: Span) {
  const now = Date.now();
  const day = 86_400_000;

  if (!range || range.buckets === "year") {
    const first = span?._min.watchedAt?.getTime();
    return Math.max(1, first ? Math.ceil((now - first) / day) : 1);
  }

  const from = range.from?.getTime() ?? now;
  const to = Math.min(range.to?.getTime() ?? now, now);
  return Math.max(1, Math.ceil((to - from) / day));
}

/**
 * Map of `${mediaType}-${tmdbId}` → viewing status, for badging poster grids.
 * Movies you have logged read "watched"; shows you have started read "watching".
 */
export async function getWatchStatuses(userId: string) {
  const [movies, episodes, completion] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId }, select: { movieId: true } }),
    db.watchedEpisode.findMany({
      where: { userId },
      select: { showId: true },
      distinct: ["showId"],
    }),
    // Needs TMDB to know how many episodes exist; fails soft to "continue".
    getShowCompletion(userId).catch(() => new Map<number, ShowState>()),
  ]);

  const statuses = new Map<string, WatchStatus>();
  for (const m of movies) statuses.set(`movie-${m.movieId}`, "watched");
  for (const e of episodes) {
    statuses.set(`tv-${e.showId}`, completion.get(e.showId) ?? "continue");
  }
  return statuses;
}

/**
 * Fills in audience scores for rows saved before the score column existed, and
 * writes them back so the lookup happens once per title.
 */
export async function backfillScores<T extends { id: string; movieId: number; score: number | null }>(
  rows: T[],
): Promise<T[]> {
  const missing = rows.filter((r) => r.score === null);
  if (missing.length === 0 || !tmdbConfigured()) return rows;

  const found = await Promise.all(
    missing.map(async (row) => ({ row, score: await getScore("movie", row.movieId) })),
  );

  const patched = new Map<string, number>();
  for (const { row, score } of found) {
    if (score === null) continue;
    patched.set(row.id, score);
    await db.watchedMovie.update({ where: { id: row.id }, data: { score } }).catch(() => undefined);
  }

  return rows.map((row) => (patched.has(row.id) ? { ...row, score: patched.get(row.id)! } : row));
}
