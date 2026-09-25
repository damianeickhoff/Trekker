import "server-only";
import { addDays, todayKey } from "./dates";
import { db } from "./db";

/**
 * What is coming, for one person: air dates for shows they watch or have on
 * their watchlist, series premieres, and cinema and streaming dates for films
 * on their watchlist. A schedule, not a diary: watch history only ever adds a
 * tick to something that is on it anyway.
 *
 * Rows only. Episodes are `ShowEpisode` by `airDate`, joined to this person's
 * `TitleState` by primary key; premieres are `TitleState.premiereDate`; films
 * are the release dates the daily job writes onto `WatchlistItem`. Nothing
 * here can reach TMDB, which is what lets the calendar be a plain query.
 */

export type LandingKind = "episode" | "premiere" | "cinema" | "streaming";

/** Episodes worth calling out, the ones people plan an evening around. */
export type LandingTag = "series-premiere" | "season-premiere" | "finale" | null;

export type Landing = {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  kind: LandingKind;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  /**
   * The show's backdrop, denormalised on `TitleState` like its poster, for
   * Home's wide Landing soon cards. Null for films: the watchlist row has
   * none, and Home looks it up in the cached details (`filmBackdrops`).
   */
  backdrop: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  runtime: number | null;
  tag: LandingTag;
  watched: boolean;
};

const num = (v: number | bigint | null) => (v === null ? null : Number(v));

/**
 * Every episode airing between two dates, inclusive, of this person's shows,
 * dropped ones excluded. One statement over the `airDate` index; the watched
 * tick is a primary-key probe per row.
 */
async function episodesBetween(userId: string, from: string, to: string) {
  type Raw = {
    date: string;
    showId: number | bigint;
    title: string;
    poster: string | null;
    backdrop: string | null;
    seasonNumber: number | bigint;
    episodeNumber: number | bigint;
    episodeName: string;
    runtime: number | bigint | null;
    episodeType: string | null;
    watched: number | bigint;
    followed: number | bigint;
  };
  const rows = await db.$queryRaw<Raw[]>`
    SELECT e."airDate" AS date, e."showId" AS showId, t."showName" AS title, t."showPoster" AS poster, t."backdrop" AS backdrop,
           e."seasonNumber" AS seasonNumber, e."episodeNumber" AS episodeNumber, e."name" AS episodeName,
           e."runtime" AS runtime, e."episodeType" AS episodeType,
           EXISTS (
             SELECT 1 FROM "WatchedEpisode" w
             WHERE w."userId" = t."userId" AND w."showId" = e."showId"
               AND w."seasonNumber" = e."seasonNumber" AND w."episodeNumber" = e."episodeNumber"
           ) AS watched,
           (t."watchedCount" > 0) AS followed
    FROM "ShowEpisode" e
    JOIN "TitleState" t ON t."showId" = e."showId" AND t."userId" = ${userId}
    WHERE e."airDate" >= ${from} AND e."airDate" <= ${to} AND e."seasonNumber" > 0
      AND NOT EXISTS (SELECT 1 FROM "DroppedShow" d WHERE d."userId" = t."userId" AND d."showId" = t."showId")`;

  return rows.map((r) => {
    const season = Number(r.seasonNumber);
    const episode = Number(r.episodeNumber);
    const showId = Number(r.showId);
    const tag: LandingTag =
      episode === 1 ? (season === 1 ? "series-premiere" : "season-premiere") : r.episodeType === "finale" ? "finale" : null;
    return {
      landing: {
        key: `ep-${showId}-${season}-${episode}`,
        date: r.date,
        kind: "episode",
        mediaType: "tv",
        tmdbId: showId,
        title: r.title,
        poster: r.poster,
        backdrop: r.backdrop,
        seasonNumber: season,
        episodeNumber: episode,
        episodeName: r.episodeName,
        runtime: num(r.runtime),
        tag,
        watched: Boolean(Number(r.watched)),
      } satisfies Landing,
      followed: Boolean(Number(r.followed)),
    };
  });
}

/**
 * Announced shows whose episodes TMDB has not listed yet: the premiere is only
 * known from the show's first air date. Once season one's first episode has a
 * date of its own, that row speaks for it and this one stands aside.
 */
async function premieresBetween(userId: string, from: string, to: string): Promise<Landing[]> {
  type Raw = { showId: number | bigint; title: string; poster: string | null; backdrop: string | null; date: string };
  const rows = await db.$queryRaw<Raw[]>`
    SELECT t."showId" AS showId, t."showName" AS title, t."showPoster" AS poster, t."backdrop" AS backdrop, t."premiereDate" AS date
    FROM "TitleState" t
    WHERE t."userId" = ${userId} AND t."premiereDate" >= ${from} AND t."premiereDate" <= ${to}
      AND NOT EXISTS (
        SELECT 1 FROM "ShowEpisode" e
        WHERE e."showId" = t."showId" AND e."seasonNumber" = 1 AND e."episodeNumber" = 1 AND e."airDate" IS NOT NULL
      )
      AND NOT EXISTS (SELECT 1 FROM "DroppedShow" d WHERE d."userId" = t."userId" AND d."showId" = t."showId")`;
  return rows.map((r) => ({
    key: `premiere-${Number(r.showId)}`,
    date: r.date,
    kind: "premiere",
    mediaType: "tv",
    tmdbId: Number(r.showId),
    title: r.title,
    poster: r.poster,
    backdrop: r.backdrop,
    seasonNumber: 1,
    episodeNumber: 1,
    episodeName: null,
    runtime: null,
    tag: "series-premiere",
    watched: false,
  }));
}

/** Watchlisted films reaching cinemas or streaming in the range; one entry per date. */
async function filmsBetween(userId: string, from: string, to: string): Promise<Landing[]> {
  const rows = await db.watchlistItem.findMany({
    where: {
      userId,
      mediaType: "movie",
      OR: [
        { releaseDate: { gte: from, lte: to } },
        { streamingDate: { gte: from, lte: to } },
      ],
    },
    select: { tmdbId: true, title: true, poster: true, runtime: true, releaseDate: true, streamingDate: true },
  });
  const watched = new Set(
    rows.length
      ? (
          await db.watchedMovie.findMany({
            where: { userId, movieId: { in: rows.map((r) => r.tmdbId) } },
            select: { movieId: true },
          })
        ).map((w) => w.movieId)
      : [],
  );

  const out: Landing[] = [];
  for (const row of rows) {
    const base = {
      mediaType: "movie" as const,
      tmdbId: row.tmdbId,
      title: row.title,
      poster: row.poster,
      backdrop: null,
      seasonNumber: null,
      episodeNumber: null,
      episodeName: null,
      runtime: row.runtime,
      tag: null,
      watched: watched.has(row.tmdbId),
    };
    const inRange = (d: string | null): d is string => d !== null && d >= from && d <= to;
    if (inRange(row.releaseDate)) out.push({ ...base, key: `cinema-${row.tmdbId}`, date: row.releaseDate, kind: "cinema" });
    // The same day both ways is one arrival, and "in cinemas" is the news.
    if (inRange(row.streamingDate) && row.streamingDate !== row.releaseDate) {
      out.push({ ...base, key: `streaming-${row.tmdbId}`, date: row.streamingDate, kind: "streaming" });
    }
  }
  return out;
}

function byDate(a: Landing, b: Landing) {
  return (
    a.date.localeCompare(b.date) ||
    a.title.localeCompare(b.title) ||
    (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
    (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
  );
}

/**
 * Everything landing between two dates, inclusive, in date order: the agenda.
 * Every episode is listed, not just the first per show, since a week with a
 * double bill should show both.
 */
export async function getAgenda(userId: string, from: string, to: string): Promise<Landing[]> {
  const [episodes, premieres, films] = await Promise.all([
    episodesBetween(userId, from, to),
    premieresBetween(userId, from, to),
    filmsBetween(userId, from, to),
  ]);
  return [...episodes.map((e) => e.landing), ...premieres, ...films].sort(byDate);
}

/**
 * The first thing each title has coming in a span, soonest first: the rails.
 *
 * One entry per title, since a rail of the same poster four times says less
 * than four different ones. Watched entries are left out: there is nothing to
 * look forward to in something already seen. So is anything airing today on a
 * show already being watched, because that is Up next's to show, not this.
 */
export async function getLanding(
  userId: string,
  { from, to, take, today = todayKey() }: { from: string; to: string; take: number; today?: string },
): Promise<Landing[]> {
  const [episodes, premieres, films] = await Promise.all([
    episodesBetween(userId, from, to),
    premieresBetween(userId, from, to),
    filmsBetween(userId, from, to),
  ]);
  const candidates = [
    ...episodes.filter((e) => !(e.followed && e.landing.date <= today)).map((e) => e.landing),
    ...premieres,
    ...films,
  ]
    .filter((l) => !l.watched)
    .sort(byDate);

  const seen = new Set<string>();
  const out: Landing[] = [];
  for (const l of candidates) {
    const title = `${l.mediaType}-${l.tmdbId}`;
    if (seen.has(title)) continue;
    seen.add(title);
    out.push(l);
    if (out.length === take) break;
  }
  return out;
}

/**
 * Home's Landing soon: three weeks starting today, so 21 days counting today
 * and the last one is `today + 20`. Every title in the span by default, since
 * the heading counts them; a caller that only draws a few can ask for fewer.
 */
export const LANDING_SOON_DAYS = 21;

export function getLandingSoon(userId: string, today = todayKey(), take = Infinity) {
  return getLanding(userId, { from: today, to: addDays(today, LANDING_SOON_DAYS - 1), take, today });
}

/** The calendar's Coming up: the eight weeks after the week on screen. */
export function getComingUp(userId: string, weekEnd: string, today = todayKey(), take = 12) {
  // A week in the past has nothing "coming up" after it that is not also
  // after today, so the span starts at whichever is later.
  const from = addDays(weekEnd, 1) > today ? addDays(weekEnd, 1) : today;
  return getLanding(userId, { from, to: addDays(from, 55), take, today });
}
