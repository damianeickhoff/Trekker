import "server-only";
import { cache } from "react";
import type { IconName } from "@/components/icon";
import { longestStreak } from "./achievements/catalogue";
import { getLevel } from "./achievements/xp";
import { avatarUrl } from "./avatar";
import { db } from "./db";
import { friendsOf } from "./friends";
import { formatNumber } from "./levels";
import { cacheKey, movieDetailsKey, tvDetailsKey } from "./tmdb";

/**
 * The profile's figures, ported from the old app's profile (`stats.ts`,
 * `fun-stats.ts`, `heatmap.ts`, `profile.ts` there), all from rows: the play
 * log, the watched tables, `TitleMeta` for genres, years and franchises, and
 * `TmdbCache` for cast. Nothing here reaches TMDB; a title the top-up has not
 * described yet simply counts for less until it has been.
 *
 * Most of it follows the range switch (`?range=`). The heatmap does not: a
 * heatmap of "this month" is four columns and says nothing, so it is always
 * the last six months. Ratings and this week's record do not either; they
 * are a record of what just happened rather than another cut of the numbers.
 *
 * Time is the household's: JavaScript's local dates follow the server's zone,
 * which for a self-hosted instance is theirs.
 *
 * The pure folds are exported so the tests can hold them to a fixture; the
 * reads under them are thin.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// The range

export const RANGE_KEYS = ["month", "year", "last-year", "all"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: "This month",
  year: "This year",
  "last-year": "Last year",
  all: "All time",
};

export type Range = {
  key: RangeKey;
  label: string;
  /** Inclusive; null for all time. */
  from: Date | null;
  /** Exclusive; null for "up to now". */
  to: Date | null;
  /** What one point of the chart is: a month wants days, a year months, all of it years. */
  buckets: "day" | "month" | "year";
};

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && (RANGE_KEYS as readonly string[]).includes(value);
}

/**
 * Calendar edges in local time rather than rolling windows: "this year" is
 * January onwards, because that is what people mean by it.
 */
export function resolveRange(key: RangeKey, now = new Date()): Range {
  const label = RANGE_LABELS[key];
  const y = now.getFullYear();
  switch (key) {
    case "month":
      return { key, label, from: new Date(y, now.getMonth(), 1), to: null, buckets: "day" };
    case "year":
      return { key, label, from: new Date(y, 0, 1), to: null, buckets: "month" };
    case "last-year":
      return { key, label, from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1), buckets: "month" };
    case "all":
      return { key, label, from: null, to: null, buckets: "year" };
  }
}

function rangeWhere(range: Range) {
  if (!range.from && !range.to) return {};
  return { watchedAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } };
}

/**
 * Days the window has actually covered, for the daily average: three hours
 * on the first of the month is three hours a day so far, not six minutes.
 */
export function elapsedDays(range: Range, first: Date | null, now = new Date()) {
  const from = range.from?.getTime() ?? first?.getTime() ?? now.getTime();
  const to = Math.min(range.to?.getTime() ?? now.getTime(), now.getTime());
  return Math.max(1, Math.ceil((to - from) / DAY_MS));
}

// ---------------------------------------------------------------------------
// Formatting shared by the page

/** "42m", "2h 14m", "166d 21h": the span in the largest two units that say it. */
export function formatSpan(minutes: number) {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  const hours = Math.round(m / 60);
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export const hoursOf = (minutes: number) => Math.round(minutes / 60);

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** A local calendar day as `YYYY-MM-DD`. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// Reads shared by several sections

type RangePlay = { mediaType: string; tmdbId: number; title: string; runtime: number; watchedAt: Date };

/**
 * Every viewing in the window, once per request: the big number, the chart,
 * the weekday bars and the habits each stream in their own boundary, and all
 * of them fold the same rows. A few thousand narrow rows is cheaper than four
 * grouped queries that each miss something the next one needs.
 */
const rangePlays = cache(async (userId: string, key: RangeKey): Promise<RangePlay[]> =>
  db.play.findMany({
    where: { userId, ...rangeWhere(resolveRange(key)) },
    select: { mediaType: true, tmdbId: true, title: true, runtime: true, watchedAt: true },
  }),
);

/** The first and last viewing ever, for the all-time axis and "Watching since". */
const playSpan = cache(async (userId: string) => {
  const span = await db.play.aggregate({ where: { userId }, _min: { watchedAt: true }, _max: { watchedAt: true } });
  return { first: span._min.watchedAt, last: span._max.watchedAt };
});

// ---------------------------------------------------------------------------
// Tier 1: the hero

export type ProfileHead = {
  id: string;
  name: string;
  avatar: string | null;
  /** Behind the hero: the chosen backdrop, else the most-watched show's, else the last poster. */
  art: { path: string; kind: "backdrop" | "poster" } | null;
  since: number | null;
  friends: number;
  minutes: number;
  plays: number;
  level: Awaited<ReturnType<typeof getLevel>>;
};

export async function profileHead(userId: string): Promise<ProfileHead | null> {
  const [user, level, friends, span, topShow] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, avatarSetAt: true, coverBackdrop: true, minutesWatched: true, playCount: true },
    }),
    getLevel(userId),
    db.friendship.count({ where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    playSpan(userId),
    db.play.groupBy({
      by: ["tmdbId"],
      where: { userId, mediaType: "tv" },
      _count: { _all: true },
      orderBy: { _count: { tmdbId: "desc" } },
      take: 1,
    }),
  ]);
  if (!user) return null;

  let art: ProfileHead["art"] = user.coverBackdrop ? { path: user.coverBackdrop, kind: "backdrop" } : null;
  if (!art && topShow[0]) art = await showBackdrop(userId, topShow[0].tmdbId);
  if (!art) {
    const last = await db.play.findFirst({
      where: { userId, poster: { not: null } },
      orderBy: { watchedAt: "desc" },
      select: { poster: true },
    });
    if (last?.poster) art = { path: last.poster, kind: "poster" };
  }

  return {
    id: user.id,
    name: user.name,
    avatar: avatarUrl(user),
    art,
    since: span.first?.getFullYear() ?? null,
    friends,
    minutes: user.minutesWatched,
    plays: user.playCount,
    level,
  };
}

/** A show's backdrop from the row the refresh job keeps, else from its cached details. */
async function showBackdrop(userId: string, showId: number): Promise<ProfileHead["art"]> {
  const state = await db.titleState.findUnique({ where: { userId_showId: { userId, showId } }, select: { backdrop: true } });
  if (state?.backdrop) return { path: state.backdrop, kind: "backdrop" };
  const { path, params } = tvDetailsKey(showId);
  const row = await db.tmdbCache.findUnique({ where: { key: cacheKey(path, params) }, select: { body: true } });
  try {
    const backdrop = row ? (JSON.parse(row.body) as { backdrop_path?: string | null }).backdrop_path : null;
    return backdrop ? { path: backdrop, kind: "backdrop" } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tier 1: the big number and the four cards

export type Totals = {
  totalMinutes: number;
  tvMinutes: number;
  filmMinutes: number;
  /** Viewings, not titles: a film seen twice is two. */
  episodes: number;
  filmViewings: number;
  distinctFilms: number;
  distinctShows: number;
  /** All time shows the last thirty days; a window shows its daily average instead. */
  recent: { label: string; minutes: number; sub: string };
  longestStreak: number;
  /** The run ending today or yesterday, where the window reaches today. */
  currentStreak: number | null;
};

/**
 * The run of days ending today, or yesterday: a streak is not broken until a
 * whole day has passed without anything.
 */
export function currentStreak(days: string[], now = new Date()): number {
  const set = new Set(days);
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!set.has(dayKey(cursor))) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return n;
}

/** Sorted distinct local days, as date keys. */
export function daysOf(plays: { watchedAt: Date }[]): string[] {
  return [...new Set(plays.map((p) => dayKey(p.watchedAt)))].sort();
}

const asDates = (keys: string[]) =>
  keys.map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return { date: new Date(y, m - 1, d) };
  });

export function totalsFrom(plays: RangePlay[], range: Range, first: Date | null, now = new Date()): Totals {
  let tvMinutes = 0;
  let filmMinutes = 0;
  let episodes = 0;
  let filmViewings = 0;
  let last30 = 0;
  const films = new Set<number>();
  const shows = new Set<number>();
  const cutoff = now.getTime() - 30 * DAY_MS;
  for (const p of plays) {
    if (p.mediaType === "tv") {
      tvMinutes += p.runtime;
      episodes += 1;
      shows.add(p.tmdbId);
    } else {
      filmMinutes += p.runtime;
      filmViewings += 1;
      films.add(p.tmdbId);
    }
    if (p.watchedAt.getTime() >= cutoff) last30 += p.runtime;
  }
  const total = tvMinutes + filmMinutes;
  const days = daysOf(plays);
  const reachesToday = range.to === null;
  return {
    totalMinutes: total,
    tvMinutes,
    filmMinutes,
    episodes,
    filmViewings,
    distinctFilms: films.size,
    distinctShows: shows.size,
    recent:
      range.key === "all"
        ? { label: "Last 30 days", minutes: last30, sub: "the recent run" }
        : { label: "Daily average", minutes: Math.round(total / elapsedDays(range, first, now)), sub: "across this window" },
    longestStreak: longestStreak(asDates(days)),
    currentStreak: reachesToday ? currentStreak(days, now) : null,
  };
}

export async function profileTotals(userId: string, key: RangeKey): Promise<Totals> {
  const [plays, span] = await Promise.all([rangePlays(userId, key), playSpan(userId)]);
  return totalsFrom(plays, resolveRange(key), span.first);
}

// ---------------------------------------------------------------------------
// Your time: the series

export type SeriesPoint = { key: string; label: string; long: string; minutes: number };
export type Series = { unit: "day" | "month" | "year"; points: SeriesPoint[]; live: boolean };

function monthPoints(year: number, now: Date) {
  const current = year === now.getFullYear();
  const count = current ? now.getMonth() + 1 : 12;
  return {
    points: Array.from({ length: count }, (_, m) => ({ key: `${year}-${m}`, label: MONTHS[m], long: `${LONG_MONTHS[m]} ${year}` })),
    live: current,
  };
}

/**
 * The chart's buckets, seeded with zeroes so a quiet stretch keeps its place
 * on the axis, and never past today: a month that has not happened is not a
 * zero, and drawing one drags the curve to the floor. `live` says the last
 * point is still filling, which is what its hollow marker means; last year
 * has none.
 */
export function seriesFrom(
  plays: { runtime: number; watchedAt: Date }[],
  range: Range,
  span: { first: Date | null; last: Date | null },
  now = new Date(),
): Series {
  let unit: Series["unit"];
  let shape: { points: Omit<SeriesPoint, "minutes">[]; live: boolean };
  let keyOf: (d: Date) => string;
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

  if (range.buckets === "day") {
    unit = "day";
    const start = range.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const points: Omit<SeriesPoint, "minutes">[] = [];
    for (let d = new Date(start); d <= now; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      points.push({ key: dayKey(d), label: String(d.getDate()), long: `${d.getDate()} ${MONTHS[d.getMonth()]}` });
    }
    shape = { points, live: true };
    keyOf = dayKey;
  } else if (range.buckets === "month") {
    unit = "month";
    shape = monthPoints((range.from ?? now).getFullYear(), now);
    keyOf = monthKey;
  } else {
    const first = span.first?.getFullYear() ?? now.getFullYear();
    const last = span.last?.getFullYear() ?? now.getFullYear();
    if (first === last) {
      // One point is not a chart: a single year of history draws its months.
      unit = "month";
      shape = monthPoints(first, now);
      keyOf = monthKey;
    } else {
      unit = "year";
      const points = [];
      for (let y = first; y <= last; y++) points.push({ key: String(y), label: String(y), long: String(y) });
      shape = { points, live: last === now.getFullYear() };
      keyOf = (d) => String(d.getFullYear());
    }
  }

  const sums = new Map(shape.points.map((p) => [p.key, 0]));
  for (const p of plays) {
    const k = keyOf(p.watchedAt);
    const had = sums.get(k);
    if (had !== undefined) sums.set(k, had + p.runtime);
  }
  return { unit, live: shape.live, points: shape.points.map((p) => ({ ...p, minutes: sums.get(p.key) ?? 0 })) };
}

export async function profileSeries(userId: string, key: RangeKey): Promise<Series> {
  const [plays, span] = await Promise.all([rangePlays(userId, key), playSpan(userId)]);
  return seriesFrom(plays, resolveRange(key), span);
}

// ---------------------------------------------------------------------------
// When you watch

export type Weekdays = {
  /** Monday first: a weekend reads as the two columns at the end. */
  days: { label: string; minutes: number }[];
  /** The busiest day's index, or null with nothing watched. */
  top: number | null;
  /** The busiest day's share of the week, as a whole percentage. */
  share: number;
};

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAY_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/** Minutes per weekday: an evening's film weighs what it lasted, not one tick. */
export function weekdaysFrom(plays: { runtime: number; watchedAt: Date }[]): Weekdays {
  const minutes = [0, 0, 0, 0, 0, 0, 0];
  for (const p of plays) minutes[(p.watchedAt.getDay() + 6) % 7] += p.runtime;
  const total = minutes.reduce((a, b) => a + b, 0);
  const top = total > 0 ? minutes.indexOf(Math.max(...minutes)) : null;
  return {
    days: WEEKDAY_SHORT.map((label, i) => ({ label, minutes: minutes[i] })),
    top,
    share: top === null ? 0 : Math.round((minutes[top] / total) * 100),
  };
}

export async function profileWeekdays(userId: string, key: RangeKey): Promise<Weekdays> {
  return weekdaysFrom(await rangePlays(userId, key));
}

// ---------------------------------------------------------------------------
// What you watch

export type GenreShare = { name: string; share: number };

/**
 * The five genres that turn up most, one vote per title, as shares of those
 * five. Of the five rather than of everything: the facts arrive a few titles
 * at a time, so a share claiming to cover the whole history would be made up,
 * and five that add up to a hundred is a claim the bar can stand behind.
 */
export function genreSharesFrom(titles: string[][], take = 5): GenreShare[] {
  const tally = new Map<string, number>();
  for (const genres of titles) for (const g of new Set(genres)) tally.set(g, (tally.get(g) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, take);
  const sum = top.reduce((s, [, n]) => s + n, 0);
  return top.map(([name, n]) => ({ name, share: Math.round((n / sum) * 100) }));
}

/** Distinct titles in the window, split by kind. */
function titlesIn(plays: RangePlay[]) {
  const films = new Set<number>();
  const shows = new Set<number>();
  for (const p of plays) (p.mediaType === "tv" ? shows : films).add(p.tmdbId);
  return { films: [...films], shows: [...shows] };
}

export async function profileGenres(userId: string, key: RangeKey): Promise<GenreShare[]> {
  const { films, shows } = titlesIn(await rangePlays(userId, key));
  if (films.length + shows.length === 0) return [];
  const meta = await db.titleMeta.findMany({
    where: { OR: [{ mediaType: "movie", tmdbId: { in: films } }, { mediaType: "tv", tmdbId: { in: shows } }] },
    select: { genres: true },
  });
  return genreSharesFrom(meta.map((m) => m.genres.split(",").map((g) => g.trim()).filter(Boolean)));
}

// ---------------------------------------------------------------------------
// Every day: the heatmap

export type HeatCell = { date: string; minutes: number; level: 0 | 1 | 2 | 3 | 4 };
export type Heatmap = {
  /** Weeks across, Monday first down each; the last week stops at today. */
  weeks: HeatCell[][];
  daysWatched: number;
  peak: number;
};

/**
 * Four steps up from nothing, as a share of the busiest day: scaled to the
 * person, so a light year still shows its shape and a binge does not flatten
 * everything else.
 */
export function heatLevel(minutes: number, peak: number): HeatCell["level"] {
  if (minutes <= 0) return 0;
  const share = peak > 0 ? minutes / peak : 1;
  if (share >= 0.6) return 4;
  if (share >= 0.35) return 3;
  if (share >= 0.15) return 2;
  return 1;
}

/** Columns in the grid, this week's included. */
export const HEAT_WEEKS = 26;

/**
 * The Monday that starts the grid: this week's Monday and the whole weeks
 * before it, so the grid is exactly `weeks` columns wide. Twenty-six, half a
 * year, is what one strip holds across a third of the column at the cell
 * size the card had when it showed a year in two bands.
 */
export function heatmapStart(now = new Date(), weeks = HEAT_WEEKS) {
  const monday = now.getDate() - ((now.getDay() + 6) % 7);
  return new Date(now.getFullYear(), now.getMonth(), monday - (weeks - 1) * 7);
}

/**
 * The last six months, one cell a local day. Bucketed here rather than in
 * SQL, because SQLite would group by UTC and an episode finished late on a
 * winter evening east of Greenwich would land on tomorrow.
 */
export function heatmapFrom(plays: { runtime: number; watchedAt: Date }[], now = new Date(), weeks = HEAT_WEEKS): Heatmap {
  const start = heatmapStart(now, weeks);
  const byDay = new Map<string, number>();
  for (const p of plays) {
    if (p.watchedAt < start) continue;
    const k = dayKey(p.watchedAt);
    byDay.set(k, (byDay.get(k) ?? 0) + Math.max(p.runtime, 1));
  }
  const peak = Math.max(0, ...byDay.values());
  const today = dayKey(now);
  const out: HeatCell[][] = [];
  let daysWatched = 0;
  for (let d = new Date(start); dayKey(d) <= today; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const k = dayKey(d);
    const minutes = byDay.get(k) ?? 0;
    if (minutes > 0) daysWatched += 1;
    if ((d.getDay() + 6) % 7 === 0) out.push([]);
    out[out.length - 1].push({ date: k, minutes, level: heatLevel(minutes, peak) });
  }
  return { weeks: out, daysWatched, peak };
}

export async function profileHeatmap(userId: string, now = new Date()): Promise<Heatmap> {
  const plays = await db.play.findMany({
    where: { userId, watchedAt: { gte: heatmapStart(now) } },
    select: { runtime: true, watchedAt: true },
  });
  return heatmapFrom(plays, now);
}

// ---------------------------------------------------------------------------
// Most watched

export type MostWatched = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  /** Episodes for a show, viewings for a film. */
  plays: number;
  minutes: number;
};

/**
 * Films and shows in one ranking, by how often they were put on, minutes
 * breaking a tie: "what do I watch most" has one answer, so a show's episodes
 * and a film's viewings stand on the same podium, and the row says which.
 */
export function rankMostWatched<T extends { plays: number; minutes: number }>(rows: T[], take = 5): T[] {
  return [...rows].sort((a, b) => b.plays - a.plays || b.minutes - a.minutes).slice(0, take);
}

export async function profileMostWatched(userId: string, key: RangeKey, take = 5): Promise<MostWatched[]> {
  const where = { userId, ...rangeWhere(resolveRange(key)) };
  const grouped = await db.play.groupBy({
    by: ["mediaType", "tmdbId"],
    where,
    _count: { _all: true },
    _sum: { runtime: true },
    orderBy: { _count: { tmdbId: "desc" } },
    // A margin over the podium for the minutes tiebreak: anything tied below
    // it cannot reach the top five, since everything above it was watched as often.
    take: Math.max(take * 4, 20),
  });
  const top = rankMostWatched(
    grouped.map((g) => ({
      mediaType: g.mediaType === "tv" ? ("tv" as const) : ("movie" as const),
      tmdbId: g.tmdbId,
      plays: g._count._all,
      minutes: g._sum.runtime ?? 0,
    })),
    take,
  );
  // A name and a poster from the newest play that has them: artwork is missing
  // on old rows more often than new ones. One indexed read each.
  return Promise.all(
    top.map(async (row) => {
      const [newest, withPoster] = await Promise.all([
        db.play.findFirst({ where: { userId, mediaType: row.mediaType, tmdbId: row.tmdbId }, orderBy: { watchedAt: "desc" }, select: { title: true } }),
        db.play.findFirst({
          where: { userId, mediaType: row.mediaType, tmdbId: row.tmdbId, poster: { not: null } },
          orderBy: { watchedAt: "desc" },
          select: { poster: true },
        }),
      ]);
      return { ...row, title: newest?.title ?? "", poster: withPoster?.poster ?? null };
    }),
  );
}

// ---------------------------------------------------------------------------
// Watching habits

export type Habit = { key: string; label: string; value: string; sub: string; icon: IconName };

export type HabitFilm = { tmdbId: number; title: string; year: number | null; collectionId: number | null; collectionName: string | null };

export type HabitInput = {
  plays: RangePlay[];
  /** The window's distinct films with what `TitleMeta` knows of them. */
  films: HabitFilm[];
  /** The face in most of what was watched, from the cached cast lists. */
  actor: { name: string; titles: number } | null;
  verdicts: { liked: number; disliked: number };
};

const NONE = "None yet";

/**
 * The eight tiles, in the mockup's order. Each has a quiet answer for an
 * empty window rather than dropping out, so the grid keeps its shape.
 */
export function habitsFrom({ plays, films, actor, verdicts }: HabitInput): Habit[] {
  const perDay = new Map<string, { date: Date; minutes: number; episodes: number }>();
  const shows = new Map<number, { title: string; episodes: number; last: number }>();
  let episodeMinutes = 0;
  let episodes = 0;
  for (const p of plays) {
    const k = dayKey(p.watchedAt);
    const day = perDay.get(k) ?? { date: p.watchedAt, minutes: 0, episodes: 0 };
    day.minutes += p.runtime;
    if (p.mediaType === "tv") {
      day.episodes += 1;
      episodes += 1;
      episodeMinutes += p.runtime;
      const show = shows.get(p.tmdbId) ?? { title: p.title, episodes: 0, last: 0 };
      show.episodes += 1;
      // The newest play's name, in case the show was renamed between viewings.
      if (p.watchedAt.getTime() >= show.last) {
        show.last = p.watchedAt.getTime();
        show.title = p.title;
      }
      shows.set(p.tmdbId, show);
    }
    perDay.set(k, day);
  }

  // A day holding more than a day of viewing is an import landing on one
  // timestamp, not a sitting: the backfill put hundreds of episodes on single
  // instants, and "25d 21h on 21 September" would be the import's size.
  const biggest = [...perDay.values()].filter((d) => d.minutes <= 24 * 60).reduce<{ date: Date; minutes: number } | null>(
    (best, d) => (best === null || d.minutes > best.minutes ? d : best),
    null,
  );
  const streak = longestStreak(asDates([...perDay.keys()].sort()));
  const topShow = [...shows.values()].sort((a, b) => b.episodes - a.episodes)[0] ?? null;
  const binges = [...perDay.values()].filter((d) => d.episodes >= 4).length;

  // One film is a film, not a franchise.
  const franchises = new Map<number, { name: string; films: number }>();
  for (const f of films) {
    if (!f.collectionId) continue;
    const entry = franchises.get(f.collectionId) ?? { name: f.collectionName ?? "Franchise", films: 0 };
    entry.films += 1;
    franchises.set(f.collectionId, entry);
  }
  const franchise = [...franchises.values()].filter((f) => f.films >= 2).sort((a, b) => b.films - a.films)[0] ?? null;
  const oldest = films.filter((f) => f.year !== null).sort((a, b) => a.year! - b.year!)[0] ?? null;

  return [
    {
      key: "session",
      label: "Biggest session",
      icon: "trophy",
      value: biggest && biggest.minutes > 0 ? formatSpan(biggest.minutes) : NONE,
      sub: biggest && biggest.minutes > 0 ? `${biggest.date.getDate()} ${LONG_MONTHS[biggest.date.getMonth()]} ${biggest.date.getFullYear()}` : "the most in one day",
    },
    {
      key: "streak",
      label: "Longest streak",
      icon: "calendar",
      value: streak ? plural(streak, "day") : NONE,
      sub: "in a row with something logged",
    },
    {
      key: "show",
      label: "Most watched show",
      icon: "tv",
      value: topShow?.title ?? NONE,
      sub: topShow ? plural(topShow.episodes, "episode") : "no episodes in this window",
    },
    {
      key: "actor",
      label: "Most watched actor",
      icon: "user",
      value: actor?.name ?? NONE,
      sub: actor ? `in ${formatNumber(actor.titles)} titles you have watched` : "cast lists fill in as titles are opened",
    },
    {
      key: "franchise",
      label: "Top franchise",
      icon: "film",
      value: franchise?.name ?? NONE,
      sub: franchise ? `${formatNumber(franchise.films)} films watched` : "two films from one series",
    },
    {
      key: "oldest",
      label: "Oldest film",
      icon: "clock",
      value: oldest?.title ?? NONE,
      sub: oldest ? `released in ${oldest.year}` : "by release year",
    },
    {
      key: "episode",
      label: "Average episode",
      icon: "play",
      value: episodes ? `${Math.round(episodeMinutes / episodes)} min` : NONE,
      sub: episodes ? `${plural(binges, "binge day")} (4+ episodes)` : "no episodes in this window",
    },
    {
      key: "verdicts",
      label: "Episodes you rated",
      icon: "sparkle",
      value: `${formatNumber(verdicts.liked)} liked`,
      sub: `${formatNumber(verdicts.disliked)} you did not`,
    },
  ];
}

/** How far down a cast list still counts as being in it. */
const CAST_DEPTH = 10;
/** Titles a side whose cast is read: the most watched first. */
const CAST_TITLES = 200;

/**
 * The face in most of the window's titles, one vote per title rather than per
 * episode so a long-running show does not hand its lead the crown on episode
 * count alone, and never on one appearance. Read from the details the title
 * pages cached; `json_extract` pulls only the cast out of each body, so the
 * page never parses the rest of a detail answer it does not use.
 */
async function topActor(plays: RangePlay[]): Promise<HabitInput["actor"]> {
  const count = new Map<string, number>();
  for (const p of plays) count.set(`${p.mediaType}:${p.tmdbId}`, (count.get(`${p.mediaType}:${p.tmdbId}`) ?? 0) + 1);
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const pick = (kind: string) =>
    ranked
      .filter((k) => k.startsWith(`${kind}:`))
      .slice(0, CAST_TITLES)
      .map((k) => Number(k.split(":")[1]));
  const keys = [
    ...pick("movie").map((id) => movieDetailsKey(id)),
    ...pick("tv").map((id) => tvDetailsKey(id)),
  ].map(({ path, params }) => cacheKey(path, params));
  if (keys.length === 0) return null;

  const rows = await db.$queryRawUnsafe<{ cast: string | null }[]>(
    `SELECT json_extract("body", '$.credits.cast') AS "cast" FROM "TmdbCache" WHERE "key" IN (${keys.map(() => "?").join(",")}) AND json_valid("body")`,
    ...keys,
  );
  const actors = new Map<number, { name: string; titles: number }>();
  for (const row of rows) {
    if (!row.cast) continue;
    let cast: { id: number; name: string }[];
    try {
      cast = JSON.parse(row.cast);
    } catch {
      continue;
    }
    for (const member of cast.slice(0, CAST_DEPTH)) {
      const entry = actors.get(member.id) ?? { name: member.name, titles: 0 };
      entry.titles += 1;
      actors.set(member.id, entry);
    }
  }
  return [...actors.values()].filter((a) => a.titles >= 2).sort((a, b) => b.titles - a.titles)[0] ?? null;
}

export async function profileHabits(userId: string, key: RangeKey): Promise<Habit[]> {
  const plays = await rangePlays(userId, key);
  const { films } = titlesIn(plays);
  const [meta, actor, verdicts] = await Promise.all([
    films.length
      ? db.titleMeta.findMany({
          where: { mediaType: "movie", tmdbId: { in: films } },
          select: { tmdbId: true, title: true, releaseDate: true, collectionId: true, collectionName: true },
        })
      : Promise.resolve([]),
    topActor(plays),
    db.episodeRating.groupBy({ by: ["liked"], where: { userId }, _count: { _all: true } }),
  ]);
  // The logged title is what they saw when they logged it, so it is the one they will recognise.
  const logged = new Map(plays.filter((p) => p.mediaType === "movie").map((p) => [p.tmdbId, p.title]));
  return habitsFrom({
    plays,
    films: meta.map((m) => {
      const year = Number(m.releaseDate?.slice(0, 4));
      return {
        tmdbId: m.tmdbId,
        title: logged.get(m.tmdbId) ?? m.title,
        year: Number.isFinite(year) && year > 1800 ? year : null,
        collectionId: m.collectionId,
        collectionName: m.collectionName,
      };
    }),
    actor,
    verdicts: {
      liked: verdicts.find((v) => v.liked)?._count._all ?? 0,
      disliked: verdicts.find((v) => !v.liked)?._count._all ?? 0,
    },
  });
}

// ---------------------------------------------------------------------------
// Ratings and reviews

export type RatedRow = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number;
  review: string | null;
  at: string;
};

/** The latest ratings, a review where one was written; `take` null for all of them. */
export async function recentRatings(userId: string, take: number | null = 12): Promise<{ count: number; rows: RatedRow[] }> {
  const [count, rows] = await Promise.all([
    db.rating.count({ where: { userId } }),
    db.rating.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      ...(take === null ? {} : { take }),
      select: { mediaType: true, tmdbId: true, title: true, poster: true, score: true, review: true, updatedAt: true },
    }),
  ]);
  return {
    count,
    rows: rows.map((r) => ({
      mediaType: r.mediaType === "tv" ? "tv" : "movie",
      tmdbId: r.tmdbId,
      title: r.title,
      poster: r.poster,
      score: r.score,
      review: r.review?.trim() || null,
      at: r.updatedAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Everything you watched: this week, and the full history

export type RecordRow = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  runtime: number;
  at: string;
};

const RECORD_FIELDS = {
  id: true,
  mediaType: true,
  tmdbId: true,
  title: true,
  poster: true,
  seasonNumber: true,
  episodeNumber: true,
  episodeName: true,
  runtime: true,
  watchedAt: true,
} as const;

type RecordSource = Omit<RecordRow, "at" | "mediaType"> & { mediaType: string; watchedAt: Date };

const toRecord = (p: RecordSource): RecordRow => ({
  id: p.id,
  mediaType: p.mediaType === "tv" ? "tv" : "movie",
  tmdbId: p.tmdbId,
  title: p.title,
  poster: p.poster,
  seasonNumber: p.seasonNumber,
  episodeNumber: p.episodeNumber,
  episodeName: p.episodeName,
  runtime: p.runtime,
  at: p.watchedAt.toISOString(),
});

/** How much of the week the profile draws before "Show more" says the rest is on its own page. */
export const WEEK_ROWS = 12;

/** Monday, matching the weekday bars, where weeks start in en-GB. */
export function weekStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
}

/** This week's viewings, newest first, and whether there were more than the profile shows. */
export async function weekRecord(userId: string, now = new Date(), limit = WEEK_ROWS): Promise<{ rows: RecordRow[]; more: boolean }> {
  const plays = await db.play.findMany({
    where: { userId, watchedAt: { gte: weekStart(now) } },
    // The id breaks ties: backfilled rows can share one timestamp.
    orderBy: [{ watchedAt: "desc" }, { id: "desc" }],
    select: RECORD_FIELDS,
    take: limit + 1,
  });
  return { rows: plays.slice(0, limit).map(toRecord), more: plays.length > limit };
}

/** Viewings per page of the history. Days are whatever those viewings fall on. */
export const HISTORY_PAGE = 40;

export type HistoryDay = { key: string; minutes: number; rows: RecordRow[] };

/** Rows into local days, newest first, in the order they came. */
export function groupByDay(rows: RecordRow[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const row of rows) {
    const key = dayKey(new Date(row.at));
    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = { key, minutes: 0, rows: [] };
      days.push(day);
    }
    day.minutes += row.runtime;
    day.rows.push(row);
  }
  return days;
}

/**
 * One page of everything, newest first. One row over the page is asked for to
 * learn whether there is another, rather than counting the whole log.
 */
export async function historyPage(userId: string, page: number): Promise<{ days: HistoryDay[]; more: boolean; total: number }> {
  const [plays, total] = await Promise.all([
    db.play.findMany({
      where: { userId },
      orderBy: [{ watchedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * HISTORY_PAGE,
      take: HISTORY_PAGE + 1,
      select: RECORD_FIELDS,
    }),
    db.play.count({ where: { userId } }),
  ]);
  return { days: groupByDay(plays.slice(0, HISTORY_PAGE).map(toRecord)), more: plays.length > HISTORY_PAGE, total };
}

export { friendsOf };
