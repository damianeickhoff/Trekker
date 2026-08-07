import "server-only";
import { db } from "./db";
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
  const plays = await db.play.findMany({
    where: { userId, ...(range ? rangeFilter(range) : {}) },
    select: {
      mediaType: true,
      tmdbId: true,
      title: true,
      poster: true,
      runtime: true,
      watchedAt: true,
    },
  });

  const byTitle = new Map<string, MostWatched>();

  for (const play of plays) {
    const mediaType = play.mediaType === "movie" ? "movie" : "tv";
    const key = `${mediaType}-${play.tmdbId}`;

    const entry = byTitle.get(key) ?? {
      key,
      mediaType,
      tmdbId: play.tmdbId,
      title: play.title,
      poster: play.poster,
      plays: 0,
      minutes: 0,
      lastWatchedAt: play.watchedAt,
    };

    entry.plays += 1;
    entry.minutes += play.runtime;
    // Artwork goes missing on old rows more often than on new ones, so a later
    // play is the better bet for a poster.
    if (play.watchedAt > entry.lastWatchedAt) {
      entry.lastWatchedAt = play.watchedAt;
      entry.poster = play.poster ?? entry.poster;
    }

    byTitle.set(key, entry);
  }

  return [...byTitle.values()]
    .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
    .slice(0, limit);
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
export async function getWeekHistory(userId: string): Promise<HistoryDay[]> {
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
  });

  return groupPlays(plays);
}

export type HistoryPage = {
  days: HistoryDay[];
  page: number;
  /** False once the last row has been handed over, so the feed stops asking. */
  more: boolean;
};

/** One page of the full history, newest first. */
export async function getHistoryPage(userId: string, page = 1): Promise<HistoryPage> {
  const plays = await db.play.findMany({
    where: { userId },
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

export function countPlays(userId: string) {
  return db.play.count({ where: { userId } });
}
