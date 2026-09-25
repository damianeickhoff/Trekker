import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { todayKey } from "./dates";
import { db } from "./db";
import { saveLists } from "./lists";
import { plexWebUrl } from "./marks";
import { popcornAverage } from "./popcorn";
import { parseProviders, regionFor, subscribedAmong, summaryFor } from "./providers";
import { scheduleShow } from "./refresh";
import {
  getImages,
  getMovieDetails,
  getSeason,
  getTvDetails,
  getWatchProviders,
  offersFor,
  pickLogo,
  tmdbConfigured,
  type MediaType,
  type MovieDetails,
  type TitleLogo,
  type TvDetails,
} from "./tmdb";

/**
 * The title, episode and film pages' reads.
 *
 * These pages are the one place a render may reach TMDB: details, artwork and
 * a season come through the read-through cache, so a title somebody opened
 * yesterday costs nothing today, and one nobody has opened costs one request
 * per kind. Everything personal is rows.
 */

// ---------------------------------------------------------------------------
// The title itself

export type Loaded<T> = { details: T; logo: TitleLogo | null };

/**
 * Details and the title treatment together. Once per request however many
 * boundaries ask. Null when TMDB has never answered for this title and cannot
 * now, which the page reports rather than calling it missing.
 */
export const loadShow = cache(async (id: number): Promise<Loaded<TvDetails> | null> => {
  const [details, images] = await Promise.all([
    getTvDetails(id).catch(() => null),
    getImages("tv", id).catch(() => null),
  ]);
  return details ? { details, logo: pickLogo(images) } : null;
});

export const loadFilm = cache(async (id: number): Promise<Loaded<MovieDetails> | null> => {
  const [details, images] = await Promise.all([
    getMovieDetails(id).catch(() => null),
    getImages("movie", id).catch(() => null),
  ]);
  return details ? { details, logo: pickLogo(images) } : null;
});

/** TMDB's average as a percentage, once enough people have voted for it to mean anything. */
export function audienceScore(details: { vote_average: number; vote_count: number }): number | null {
  return details.vote_count >= 10 && details.vote_average > 0 ? Math.round(details.vote_average * 10) : null;
}

/** The first official YouTube trailer, else any trailer, else a teaser. */
export function trailerKey(details: TvDetails | MovieDetails): string | null {
  const videos = (details.videos?.results ?? []).filter((v) => v.site === "YouTube");
  const pick =
    videos.find((v) => v.type === "Trailer" && v.official) ??
    videos.find((v) => v.type === "Trailer") ??
    videos.find((v) => v.type === "Teaser");
  return pick?.key ?? null;
}

export function isEnded(status: string | undefined) {
  return status === "Ended" || status === "Canceled" || status === "Cancelled";
}

// ---------------------------------------------------------------------------
// The instance

/** The oldest account, where the Plex and Overseerr connections live. */
export const instanceAdmin = cache(async () =>
  db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, plexMachineId: true, plexUrl: true, plexToken: true, seerrUrl: true, seerrApiKey: true },
  }),
);

// ---------------------------------------------------------------------------
// The viewer

export const friendIds = cache(async (userId: string): Promise<string[]> => {
  const rows = await db.friendship.findMany({
    where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
});

/** Friends' popcorn for a title, to one decimal; null when none of them has rated it. */
export async function friendsAverage(userId: string, mediaType: MediaType, tmdbId: number) {
  const friends = await friendIds(userId);
  if (friends.length === 0) return null;
  const rows = await db.rating.findMany({
    where: { userId: { in: friends }, mediaType, tmdbId },
    select: { score: true },
  });
  return popcornAverage(rows.map((r) => r.score));
}

export async function friendsEpisodeAverage(userId: string, showId: number, season: number, episode: number) {
  const friends = await friendIds(userId);
  if (friends.length === 0) return null;
  const rows = await db.episodeRating.findMany({
    where: { userId: { in: friends }, showId, seasonNumber: season, episodeNumber: episode },
    select: { score: true },
  });
  return popcornAverage(rows.map((r) => r.score ?? 0));
}

/** Everything about one title that is this person's own, in one round of reads. */
export async function viewerOf(userId: string, mediaType: MediaType, tmdbId: number) {
  const key = { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } };
  const [rating, favourite, saved, dropped, state, film, lists] = await Promise.all([
    db.rating.findUnique({ where: key, select: { score: true } }),
    db.favourite.findUnique({ where: key, select: { id: true } }),
    db.watchlistItem.findUnique({ where: key, select: { id: true } }),
    mediaType === "tv"
      ? db.droppedShow.findUnique({ where: { userId_showId: { userId, showId: tmdbId } }, select: { id: true } })
      : null,
    mediaType === "tv" ? db.titleState.findUnique({ where: { userId_showId: { userId, showId: tmdbId } } }) : null,
    mediaType === "movie"
      ? db.watchedMovie.findUnique({
          where: { userId_movieId: { userId, movieId: tmdbId } },
          select: { plays: true, watchedAt: true, lastWatchedAt: true },
        })
      : null,
    saveLists(userId, mediaType, tmdbId),
  ]);
  return {
    rating: rating?.score ?? null,
    favourite: Boolean(favourite),
    saved: Boolean(saved),
    /** The manual lists Save's menu offers, with whether each holds this title. */
    lists,
    dropped: Boolean(dropped),
    state,
    film,
  };
}

export type Viewer = Awaited<ReturnType<typeof viewerOf>>;

// ---------------------------------------------------------------------------
// Availability

/** The job's row for a title, for the hero's Plex chip. Once per request. */
export const availabilityRow = cache(async (mediaType: MediaType, tmdbId: number) =>
  db.availability.findUnique({ where: { mediaType_tmdbId: { mediaType, tmdbId } } }),
);

export type AvailabilityView = {
  /** Whether this instance has a Plex server at all, so "not on Plex" means something. */
  plexConnected: boolean;
  onPlex: boolean;
  plexUrl: string | null;
  /** What Overseerr last said: requested and waiting, or nothing yet. */
  requested: boolean;
  /** Overseerr says it has arrived, but the server's item has not been found yet. */
  available: boolean;
  /** Whether a Request button can do anything on this instance. */
  canRequest: boolean;
  /** Streaming offers in this person's region; null when nobody could say. */
  stream: string[] | null;
  /** The subset of those this person pays for. */
  mine: string[];
  region: string;
};

/**
 * Where this person can watch a title. Plex and Overseerr come from the daily
 * job's row; streaming offers from the same row when it has looked, and from
 * TMDB through the cache when it has not, which is why the panel streams.
 */
export async function availabilityFor(userId: string, mediaType: MediaType, tmdbId: number): Promise<AvailabilityView> {
  const [row, admin, me] = await Promise.all([
    availabilityRow(mediaType, tmdbId),
    instanceAdmin(),
    db.user.findUnique({ where: { id: userId }, select: { region: true, providers: true } }),
  ]);
  const region = regionFor(me?.region);

  let offers = summaryFor(row?.providers, region);
  if (!offers && tmdbConfigured()) {
    const all = await getWatchProviders(mediaType, tmdbId).catch(() => null);
    const found = all ? offersFor(all, region) : null;
    if (all) {
      offers = {
        link: found?.link ?? null,
        stream: (found?.stream ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name })),
        free: (found?.free ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name })),
      };
    }
  }
  const streaming = offers ? [...offers.stream, ...offers.free] : null;
  const onPlex = row?.onPlex ?? false;

  return {
    plexConnected: Boolean(admin?.plexUrl && admin?.plexToken),
    onPlex,
    plexUrl: onPlex ? plexWebUrl(admin?.plexMachineId, row?.plexRatingKey) : null,
    requested: row?.overseerrStatus === "requested",
    available: !onPlex && row?.overseerrStatus === "available",
    canRequest: Boolean(admin?.seerrUrl && admin?.seerrApiKey) && !onPlex && row?.overseerrStatus !== "available",
    stream: streaming ? [...new Set(streaming.map((s) => s.name))] : null,
    mine: streaming ? subscribedAmong(parseProviders(me?.providers), streaming) : [],
    region,
  };
}

// ---------------------------------------------------------------------------
// Episodes

export type EpisodeItem = {
  season: number;
  episode: number;
  name: string;
  airDate: string | null;
  runtime: number | null;
  still: string | null;
  overview: string | null;
  voteAverage: number | null;
};

/**
 * One season's episodes: the stored rows when the refresh job keeps this show,
 * else the season through the TMDB cache. Specials are never stored, so season
 * zero always comes from the cache.
 */
export async function seasonEpisodes(showId: number, season: number): Promise<EpisodeItem[]> {
  if (season > 0) {
    const rows = await db.showEpisode.findMany({
      where: { showId, seasonNumber: season },
      orderBy: { episodeNumber: "asc" },
    });
    if (rows.length) {
      return rows.map((r) => ({
        season: r.seasonNumber,
        episode: r.episodeNumber,
        name: r.name,
        airDate: r.airDate,
        runtime: r.runtime,
        still: r.still,
        overview: null,
        voteAverage: null,
      }));
    }
  }
  const data = await getSeason(showId, season).catch(() => null);
  return (data?.episodes ?? []).map((e) => ({
    season: e.season_number,
    episode: e.episode_number,
    name: e.name || `Episode ${e.episode_number}`,
    airDate: e.air_date || null,
    runtime: e.runtime && e.runtime > 0 ? e.runtime : null,
    still: e.still_path,
    overview: e.overview || null,
    voteAverage: e.vote_average || null,
  }));
}

/**
 * The episodes this person has seen of a show, as "season:episode" keys. Once
 * per request: the hero, the progress panel and the episode list all ask.
 */
export const watchedKeys = cache(async (userId: string, showId: number): Promise<ReadonlySet<string>> => {
  const rows = await db.watchedEpisode.findMany({
    where: { userId, showId },
    select: { seasonNumber: true, episodeNumber: true },
  });
  return new Set(rows.map((r) => `${r.seasonNumber}:${r.episodeNumber}`));
});

/**
 * Time already spent on a show: each distinct episode seen once, at the
 * runtime stored with it, specials left out as the counts leave them out.
 * Rewatches are not counted again, so it reads as how long the show took.
 */
export async function minutesWatched(userId: string, showId: number): Promise<number> {
  const sum = await db.watchedEpisode.aggregate({
    where: { userId, showId, seasonNumber: { gt: 0 } },
    _sum: { runtime: true },
  });
  return sum._sum.runtime ?? 0;
}

/** The page's own reader, the row checked so a revoked session stops here. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * A show's kept numbered episodes in order. Once per request: the hero's next
 * episode and the season the page opens on both read them.
 */
export const storedEpisodes = cache((showId: number) =>
  db.showEpisode.findMany({
    where: { showId, seasonNumber: { gt: 0 } },
    orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
    select: { seasonNumber: true, episodeNumber: true, name: true, airDate: true },
  }),
);

export type NextEpisode = { season: number; episode: number; name: string | null; airDate: string | null };

/**
 * The episode the hero's button marks: the first numbered episode not yet seen.
 *
 * From the stored episode list when there is one, which is exact. A show the
 * job has never kept has none, so the page asks the job to fetch it (once,
 * deduped in the queue) and meanwhile answers from `TitleState`, or for
 * somebody who has not started, the first episode of the first season.
 */
export async function nextEpisodeFor(
  userId: string,
  details: TvDetails,
  state: Viewer["state"],
): Promise<NextEpisode | null> {
  const [rows, seen] = await Promise.all([storedEpisodes(details.id), watchedKeys(userId, details.id)]);
  if (rows.length) {
    const next = rows.find((r) => !seen.has(`${r.seasonNumber}:${r.episodeNumber}`));
    return next
      ? { season: next.seasonNumber, episode: next.episodeNumber, name: next.name, airDate: next.airDate }
      : null;
  }

  scheduleShow(details.id);
  if (state?.nextSeason && state.nextEpisode) {
    return { season: state.nextSeason, episode: state.nextEpisode, name: state.nextTitle, airDate: state.nextAirDate };
  }
  const first = details.seasons.find((s) => s.season_number > 0 && s.episode_count > 0);
  if (!first || seen.has(`${first.season_number}:1`)) return null;
  return { season: first.season_number, episode: 1, name: null, airDate: first.air_date };
}

/** Whether a YYYY-MM-DD date has arrived where the server is. Unknown means not yet. */
export function hasAired(date: string | null | undefined, today = todayKey()) {
  return Boolean(date && date <= today);
}

// ---------------------------------------------------------------------------
// Series facts for the hero

/** "2019 – 2023", or "2026 –" while it runs. */
export function yearSpan(details: TvDetails): string | null {
  const from = details.first_air_date?.slice(0, 4);
  if (!from) return null;
  if (!isEnded(details.status)) return `${from} –`;
  const to = details.last_air_date?.slice(0, 4);
  return to && to !== from ? `${from} – ${to}` : from;
}

export function numberedSeasons(details: TvDetails) {
  return details.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);
}
