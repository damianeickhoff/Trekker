import "server-only";
import { cache } from "react";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { countAiredEpisodes, getSeason, getTv, tmdbConfigured } from "./tmdb";

/** How many shows to resolve against TMDB at once. */
const FANOUT = 6;

export type UpNext = {
  showId: number;
  showName: string;
  showPoster: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  runtime: number | null;
  still: string | null;
  watchedCount: number;
  totalEpisodes: number;
};

function hasAired(airDate: string | null | undefined) {
  if (!airDate) return false;
  // TMDB air dates are plain YYYY-MM-DD; compare as dates, not timestamps.
  return new Date(`${airDate}T00:00:00Z`).getTime() <= Date.now();
}

/**
 * For every show the user has started, the first episode they have not watched
 * that has actually been released. Shows they are fully caught up on drop out.
 */
export async function getUpNext(userId: string, take = 10): Promise<UpNext[]> {
  const shows = await groupWatchedShows(userId);
  if (shows === null) return [];

  // Every show is resolved, then the finished ones fall away and the first
  // `take` of what is left are returned. Taking the slice first — as this used
  // to — meant a show you had not touched in months could never surface: it
  // sat outside the window, however far behind you were on it.
  const results = await mapLimit(shows.order, FANOUT, (showId) =>
    resolveUpNext(showId, shows.byShow.get(showId)!),
  );

  return results.filter((r): r is UpNext => r !== null).slice(0, take);
}

export type ShowState =
  /** Every episode watched and the show has finished airing. */
  | "completed"
  /** Caught up on everything released, but the show is still running. */
  | "up-to-date"
  /** Released episodes are still waiting to be watched. */
  | "continue";

/** How far along the viewer is on each show they have started. */
/**
 * Memoised per request. A show page asks for the watch statuses under both of
 * its halves, and this is what makes them expensive: a TMDB call or two for
 * every show in the viewer's library. Once per request is once too many
 * already; twice is not worth arguing about.
 */
export const getShowCompletion = cache(async function getShowCompletion(userId: string) {
  const shows = await groupWatchedShows(userId);
  const statuses = new Map<number, ShowState>();
  if (shows === null) return statuses;

  const results = await mapLimit(shows.order, FANOUT, async (showId) => ({
    showId,
    state: await resolveShowState(showId, shows.byShow.get(showId)!),
  }));

  for (const { showId, state } of results) statuses.set(showId, state);
  return statuses;
});

async function resolveShowState(
  showId: number,
  show: { name: string; poster: string | null; seen: Set<string> },
): Promise<ShowState> {
  const next = await resolveUpNext(showId, show);
  if (next !== null) return "continue";

  // Nothing left to watch right now: is that the end, or just for now?
  const detail = await getTv(showId).catch(() => null);
  const finished =
    detail?.status === "Ended" || detail?.status === "Canceled";

  return finished ? "completed" : "up-to-date";
}

async function groupWatchedShows(userId: string) {
  if (!tmdbConfigured()) return null;

  const [watched, dropped] = await Promise.all([
    db.watchedEpisode.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
      select: {
        showId: true,
        showName: true,
        showPoster: true,
        seasonNumber: true,
        episodeNumber: true,
      },
    }),
    // Given up on: the rows stay, but nothing should keep suggesting it.
    db.droppedShow.findMany({ where: { userId }, select: { showId: true } }),
  ]);

  const abandoned = new Set(dropped.map((d) => d.showId));

  // Preserve "most recently watched first" ordering while grouping.
  const order: number[] = [];
  const byShow = new Map<
    number,
    { name: string; poster: string | null; seen: Set<string> }
  >();

  for (const e of watched) {
    if (abandoned.has(e.showId)) continue;

    let entry = byShow.get(e.showId);
    if (!entry) {
      entry = { name: e.showName, poster: e.showPoster, seen: new Set() };
      byShow.set(e.showId, entry);
      order.push(e.showId);
    }
    entry.seen.add(`${e.seasonNumber}-${e.episodeNumber}`);
  }

  return { order, byShow };
}

async function resolveUpNext(
  showId: number,
  show: { name: string; poster: string | null; seen: Set<string> },
): Promise<UpNext | null> {
  const detail = await getTv(showId).catch(() => null);
  if (!detail) return null;

  const seasons = detail.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);
  // Released episodes only — counting unaired ones makes you look behind.
  const totalEpisodes = countAiredEpisodes(detail);

  for (const season of seasons) {
    // Skip seasons the user has finished without paying for the episode list.
    const unwatched = Array.from({ length: season.episode_count }, (_, i) => i + 1).filter(
      (ep) => !show.seen.has(`${season.season_number}-${ep}`),
    );
    if (unwatched.length === 0) continue;

    const detailed = await getSeason(showId, season.season_number).catch(() => null);
    if (!detailed) continue;

    for (const episode of detailed.episodes) {
      if (show.seen.has(`${season.season_number}-${episode.episode_number}`)) continue;
      if (!hasAired(episode.air_date)) continue;

      return {
        showId,
        showName: show.name,
        showPoster: show.poster ?? detail.poster_path,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        episodeName: episode.name,
        runtime: episode.runtime ?? detail.episode_run_time?.[0] ?? null,
        still: episode.still_path,
        watchedCount: show.seen.size,
        totalEpisodes,
      };
    }
  }

  return null;
}
