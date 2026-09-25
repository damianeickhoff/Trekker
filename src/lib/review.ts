import "server-only";
import { longestStreak } from "./achievements/catalogue";
import { db } from "./db";
import { dayKey } from "./profile";

/**
 * The year review at `/review`, ported from the old app's `review.ts`: what
 * was watched over a year, or over one finished month, told a beat at a time.
 * Everything comes from `Play` rows, with the popcorn buckets from `Rating`
 * and the films' years from `TitleMeta`, so it costs three reads and no TMDB
 * call. Local dates throughout, as the profile's: the server's zone is the
 * household's.
 *
 * The fold (`reviewFrom`) is pure and exported so the tests can hold it to a
 * fixture; `getReview` is the thin read around it.
 */

export type ReviewPeriod = "year" | "month";

export type ReviewBucket = {
  /** Under the bar: "J" for a month of the year, "14" for a day of the month. */
  label: string;
  /** In the sentence: "March", "14 March". */
  long: string;
  minutes: number;
};

export type ReviewShow = { tmdbId: number; title: string; poster: string | null; minutes: number; episodes: number };

export type ReviewFilm = { tmdbId: number; title: string; poster: string | null; year: string | null; score: number | null };

export type Review = {
  period: ReviewPeriod;
  /** "2026", or "August 2026". */
  label: string;
  from: Date;
  to: Date;
  totalMinutes: number;
  episodeCount: number;
  /** Viewings, rewatches included: the review is the year as it was lived. */
  filmCount: number;
  showCount: number;
  /** Longest run of consecutive days with anything logged. */
  streak: number;
  /** The day with most viewings on it; the earliest wins a tie. */
  busiestDay: { key: string; date: Date; count: number } | null;
  /** Months for a year, days for a month. */
  buckets: ReviewBucket[];
  /** The biggest bucket, or null when every one is empty. */
  peak: ReviewBucket | null;
  /** Top five by minutes; the first is the show of the year. */
  topShows: ReviewShow[];
  /** The latest six films, once each however often they were watched. */
  films: ReviewFilm[];
};

export const REVIEW_FILMS = 6;
export const REVIEW_SHOWS = 5;

const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;

/**
 * The months that can be recapped: January of this year up to the month just
 * gone, oldest first. The month in progress is left out on purpose, as the
 * old app did: a recap of half a month is a progress bar, and reads as a
 * disappointment either way. Empty in January.
 */
export function selectableMonths(now = new Date()): string[] {
  return Array.from({ length: now.getMonth() }, (_, m) => monthKey(now.getFullYear(), m));
}

/** `?m=`, if it is a month that can be recapped; else the latest that can; null in January. */
export function resolveMonth(asked: string | undefined, now = new Date()): string | null {
  const months = selectableMonths(now);
  if (months.length === 0) return null;
  return asked && months.includes(asked) ? asked : months[months.length - 1];
}

/** "August 2026" from `2026-08`. */
export function monthName(key: string) {
  return `${LONG_MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/**
 * The window: this calendar year, month in progress and all, or one finished
 * month. Null for a month when none has finished yet.
 */
export function reviewWindow(period: ReviewPeriod, month: string | null, now = new Date()) {
  if (period === "year") {
    const y = now.getFullYear();
    return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: String(y) };
  }
  if (!month) return null;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1), label: monthName(month) };
}

type ReviewPlay = { mediaType: string; tmdbId: number; title: string; poster: string | null; runtime: number; watchedAt: Date };

/**
 * Folds the window's plays into the review. The films' buckets and years are
 * left null here and filled in by `getReview`, which reads them for the six
 * films alone.
 */
export function reviewFrom(plays: ReviewPlay[], period: ReviewPeriod, window: { from: Date; to: Date; label: string }): Review {
  const { from, to, label } = window;
  const inside = plays
    .filter((p) => p.watchedAt >= from && p.watchedAt < to)
    .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());

  let totalMinutes = 0;
  let episodeCount = 0;
  let filmCount = 0;
  const shows = new Map<number, ReviewShow>();
  const perDay = new Map<string, number>();

  for (const p of inside) {
    totalMinutes += p.runtime;
    if (p.mediaType === "tv") {
      episodeCount += 1;
      const show = shows.get(p.tmdbId) ?? { tmdbId: p.tmdbId, title: p.title, poster: p.poster, minutes: 0, episodes: 0 };
      show.minutes += p.runtime;
      show.episodes += 1;
      // The latest row's poster and name, in case either changed along the way.
      show.title = p.title;
      show.poster = p.poster ?? show.poster;
      shows.set(p.tmdbId, show);
    } else {
      filmCount += 1;
    }
    const key = dayKey(p.watchedAt);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const days = [...perDay.keys()].sort();
  const streak = longestStreak(days.map((key) => ({ date: new Date(`${key}T12:00:00`) })));

  let busiestDay: Review["busiestDay"] = null;
  for (const key of days) {
    const count = perDay.get(key)!;
    if (!busiestDay || count > busiestDay.count) busiestDay = { key, date: new Date(`${key}T12:00:00`), count };
  }

  const buckets = period === "year" ? yearBuckets(from, inside) : monthBuckets(from, to, inside);
  const peak = buckets.reduce<ReviewBucket | null>((best, b) => (b.minutes > (best?.minutes ?? 0) ? b : best), null);

  const topShows = [...shows.values()]
    .sort((a, b) => b.minutes - a.minutes || b.episodes - a.episodes)
    .slice(0, REVIEW_SHOWS);

  // Newest first, once per film: without the dedupe a favourite watched four
  // times in a year would take four of the six places and crowd out
  // everything else the year had in it.
  const films: ReviewFilm[] = [];
  const seen = new Set<number>();
  for (let i = inside.length - 1; i >= 0 && films.length < REVIEW_FILMS; i--) {
    const p = inside[i];
    if (p.mediaType !== "movie" || seen.has(p.tmdbId)) continue;
    seen.add(p.tmdbId);
    films.push({ tmdbId: p.tmdbId, title: p.title, poster: p.poster, year: null, score: null });
  }

  return {
    period,
    label,
    from,
    to,
    totalMinutes,
    episodeCount,
    filmCount,
    showCount: shows.size,
    streak,
    busiestDay,
    buckets,
    peak,
    topShows,
    films,
  };
}

function yearBuckets(from: Date, plays: ReviewPlay[]): ReviewBucket[] {
  const minutes = new Array<number>(12).fill(0);
  for (const p of plays) minutes[p.watchedAt.getMonth()] += p.runtime;
  return minutes.map((m, i) => ({ label: LONG_MONTHS[i][0], long: LONG_MONTHS[i], minutes: m }));
}

function monthBuckets(from: Date, to: Date, plays: ReviewPlay[]): ReviewBucket[] {
  // Days in the month from the calendar rather than from milliseconds, so a
  // month with a clock change in it still has its right number of days.
  const count = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  const minutes = new Array<number>(count).fill(0);
  for (const p of plays) {
    if (p.watchedAt >= from && p.watchedAt < to) minutes[p.watchedAt.getDate() - 1] += p.runtime;
  }
  const month = LONG_MONTHS[from.getMonth()];
  return minutes.map((m, i) => ({ label: String(i + 1), long: `${i + 1} ${month}`, minutes: m }));
}

/**
 * The review, or null for a month when no month has finished yet. Counts
 * viewings rather than titles: an evening spent on a favourite for the third
 * time was still that evening.
 */
export async function getReview(
  userId: string,
  period: ReviewPeriod,
  month: string | null,
  now = new Date(),
): Promise<Review | null> {
  const window = reviewWindow(period, month, now);
  if (!window) return null;

  const plays = await db.play.findMany({
    where: { userId, watchedAt: { gte: window.from, lt: window.to } },
    orderBy: { watchedAt: "asc" },
    select: { mediaType: true, tmdbId: true, title: true, poster: true, runtime: true, watchedAt: true },
  });

  const review = reviewFrom(plays, period, window);
  const ids = review.films.map((f) => f.tmdbId);
  if (ids.length === 0) return review;

  // The films' buckets live on the title, not the viewing, and their years in
  // `TitleMeta`; a film not described there yet shows its kind alone.
  const [ratings, metas] = await Promise.all([
    db.rating.findMany({ where: { userId, mediaType: "movie", tmdbId: { in: ids } }, select: { tmdbId: true, score: true } }),
    db.titleMeta.findMany({ where: { mediaType: "movie", tmdbId: { in: ids } }, select: { tmdbId: true, releaseDate: true } }),
  ]);
  const scores = new Map(ratings.map((r) => [r.tmdbId, r.score]));
  const years = new Map(metas.filter((m) => m.releaseDate).map((m) => [m.tmdbId, m.releaseDate!.slice(0, 4)]));
  return {
    ...review,
    films: review.films.map((f) => ({ ...f, score: scores.get(f.tmdbId) ?? null, year: years.get(f.tmdbId) ?? null })),
  };
}
