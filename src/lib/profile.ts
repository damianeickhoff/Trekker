import "server-only";
import { db } from "./db";
import { likeTerm } from "./like";
import { rangeFilter, type Range } from "./range";

/**
 * The two reads the profile page needs that nothing else wanted: what gets
 * watched most, and everything that was ever watched.
 *
 * Both come from the play log rather than the watched tables, because both
 * questions are about viewings. A film seen four times is four; a distinct-title
 * count would answer a question nobody asked here.
 */

export type MostWatched = {
  key: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  /** Viewings for a film, episodes watched for a show. */
  plays: number;
  minutes: number;
  lastWatchedAt: Date;
};

/**
 * Films and shows in one list, ranked by how often they were put on.
 *
 * Deliberately mixed rather than two lists side by side: "what do I watch most"
 * has one answer, and splitting it by medium would give a show 60 episodes and a
 * film 4 viewings separate podiums as though they were not competing.
 *
 * A show's number is episodes, a film's is viewings. Those are different units,
 * which is why the row says which it is rather than printing a bare count.
 */
export async function getMostWatched(
  userId: string,
  limit = 5,
  range?: Range,
): Promise<MostWatched[]> {
  const where = { userId, ...(range ? rangeFilter(range) : {}) };

  /**
   * Counted in SQL rather than folded here.
   *
   * This used to read every play the account had, carrying a title and a poster
   * on each, to answer with five rows — so the cost of the podium was the size
   * of the whole log, and an account that rewatches paid it several times over.
   * The counting is what the database is for; only the winners need describing.
   */
  const ranked = await db.play.groupBy({
    by: ["mediaType", "tmdbId"],
    where,
    _count: { _all: true },
    _sum: { runtime: true },
    _max: { watchedAt: true },
    // Ties broken on minutes afterwards, as before: `groupBy` will order on one
    // aggregate at a time, and the count is the one that decides the podium.
    orderBy: { _count: { tmdbId: "desc" } },
    // A margin above the podium, so the minutes tiebreak has something to work
    // with. Titles tied on count *below* this margin cannot reach the podium
    // anyway, since everything above them was watched at least as often.
    take: Math.max(limit * 4, 20),
  });

  const top = ranked
    .map((row) => ({
      mediaType: row.mediaType === "movie" ? ("movie" as const) : ("tv" as const),
      tmdbId: row.tmdbId,
      plays: row._count._all,
      minutes: row._sum.runtime ?? 0,
      lastWatchedAt: row._max.watchedAt!,
    }))
    .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
    .slice(0, limit);

  if (top.length === 0) return [];

  /**
   * A name and a poster for each winner, from its most recent play.
   *
   * One indexed read apiece — deliberately not a single query over all five,
   * because a show's plays are its episodes and the most-watched show is by
   * definition the one with the most of them. `(userId, mediaType, tmdbId,
   * watchedAt)` is indexed, so each of these touches one row.
   *
   * Artwork goes missing on old rows more often than on new ones, so the newest
   * play is the better bet — and where even that has none, the newest row that
   * does is worth one more look rather than a gap on the podium.
   */
  const described = await Promise.all(
    top.map(async (row) => {
      const identity = { ...where, mediaType: row.mediaType, tmdbId: row.tmdbId };

      const newest = await db.play.findFirst({
        where: identity,
        select: { title: true, poster: true },
        orderBy: { watchedAt: "desc" },
      });

      const poster =
        newest?.poster ??
        (
          await db.play.findFirst({
            where: { ...identity, poster: { not: null } },
            select: { poster: true },
            orderBy: { watchedAt: "desc" },
          })
        )?.poster ??
        null;

      return {
        key: `${row.mediaType}-${row.tmdbId}`,
        ...row,
        title: newest?.title ?? "",
        poster,
      };
    }),
  );

  return described;
}

export type HistoryPlay = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  /** Season/episode, already formatted, for a show. Null for a film. */
  detail: string | null;
  runtime: number;
  watchedAt: Date;
};

export type HistoryDay = { date: Date; key: string; minutes: number; plays: HistoryPlay[] };

/** Plays per page on the full history. Days are whatever those plays fall on. */
export const HISTORY_PAGE_SIZE = 40;

const PLAY_FIELDS = {
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

type PlayRow = {
  id: string;
  mediaType: string;
  tmdbId: number;
  title: string;
  poster: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  runtime: number;
  watchedAt: Date;
};

/** Local time, so "what day was that" matches the viewer's idea of it. */
function localDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Rows into days, newest first.
 *
 * Exported shape rather than a private helper because the infinite-scroll feed
 * has to group across page boundaries on the client, and both sides grouping the
 * same way is the only thing that stops a day appearing twice.
 */
export function groupPlays(plays: PlayRow[]): HistoryDay[] {
  const days: HistoryDay[] = [];

  for (const play of plays) {
    const key = localDayKey(play.watchedAt);

    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = { date: play.watchedAt, key, minutes: 0, plays: [] };
      days.push(day);
    }

    day.minutes += play.runtime;
    day.plays.push({
      id: play.id,
      mediaType: play.mediaType === "movie" ? "movie" : "tv",
      tmdbId: play.tmdbId,
      title: play.title,
      poster: play.poster,
      detail:
        play.seasonNumber !== null && play.episodeNumber !== null
          ? `${String(play.seasonNumber).padStart(2, "0")}×${String(play.episodeNumber).padStart(2, "0")}${
              play.episodeName ? ` · ${play.episodeName}` : ""
            }`
          : null,
      runtime: play.runtime,
      watchedAt: play.watchedAt,
    });
  }

  return days;
}

/**
 * This week only, for the profile page.
 *
 * The profile used to carry the whole log behind a pager, which made the page
 * unbounded — the one thing it could not afford, since everything above it is
 * meant to be read at a glance. A week is a complete thought, and "show more"
 * leads somewhere built for the rest.
 */
export async function getWeekHistory(
  userId: string,
): Promise<{ days: HistoryDay[]; truncated: boolean }> {
  const now = new Date();
  // Monday, matching the weekday chart above it on the same page.
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));

  const plays = await db.play.findMany({
    where: { userId, watchedAt: { gte: monday } },
    // The id is a tiebreaker, not decoration. `skip`/`take` over a sort with
    // ties has no defined order between equal rows, so the same play could come
    // back on two consecutive pages — which it did, on the backfilled rows from
    // the migration, where whole imports share one timestamp.
    orderBy: [{ watchedAt: "desc" }, { id: "desc" }],
    select: PLAY_FIELDS,
    // A week is a complete thought, but it is not a small one for everybody: an
    // import landing inside it, or a weekend spent on a long-running show, put
    // a poster on the page for every episode. Past this the panel says so and
    // points at the history, which is built for that.
    take: WEEK_LIMIT + 1,
  });

  // One row over the limit is only ever asked for to answer this.
  return {
    days: groupPlays(plays.slice(0, WEEK_LIMIT)),
    truncated: plays.length > WEEK_LIMIT,
  };
}

/** How much of this week the profile will draw before deferring to the history. */
const WEEK_LIMIT = 200;

export type HistoryPage = {
  days: HistoryDay[];
  page: number;
  /** False once the last row has been handed over, so the feed stops asking. */
  more: boolean;
};

/**
 * What the history is being narrowed to. Every field optional; an empty filter
 * has to produce the same query the page ran before filtering existed.
 */
export type HistoryFilter = {
  /** Matches the title or the episode name. */
  q?: string | null;
  mediaType?: "movie" | "tv" | null;
  source?: string | null;
};

/**
 * Built once and used by both the page and the count.
 *
 * Two copies of this is how a header ends up claiming 4,961 plays above a list
 * of eleven — the count and the query have to be the same question.
 */
export function historyWhere(userId: string, filter: HistoryFilter = {}) {
  const term = likeTerm(filter.q);

  return {
    userId,
    ...(filter.mediaType ? { mediaType: filter.mediaType } : {}),
    ...(filter.source ? { source: filter.source } : {}),
    ...(term
      ? { OR: [{ title: { contains: term } }, { episodeName: { contains: term } }] }
      : {}),
  };
}

/** One page of the full history, newest first. */
export async function getHistoryPage(
  userId: string,
  page = 1,
  filter: HistoryFilter = {},
): Promise<HistoryPage> {
  const plays = await db.play.findMany({
    where: historyWhere(userId, filter),
    // The id is a tiebreaker, not decoration. `skip`/`take` over a sort with
    // ties has no defined order between equal rows, so the same play could come
    // back on two consecutive pages — which it did, on the backfilled rows from
    // the migration, where whole imports share one timestamp.
    orderBy: [{ watchedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * HISTORY_PAGE_SIZE,
    // One extra row, purely to find out whether there is a next page without a
    // second round trip or a `count` over the whole table.
    take: HISTORY_PAGE_SIZE + 1,
    select: PLAY_FIELDS,
  });

  const more = plays.length > HISTORY_PAGE_SIZE;

  return { days: groupPlays(plays.slice(0, HISTORY_PAGE_SIZE)), page, more };
}

export function countPlays(userId: string, filter: HistoryFilter = {}) {
  return db.play.count({ where: historyWhere(userId, filter) });
}
