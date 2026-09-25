import "server-only";
import { todayKey } from "./dates";
import { db } from "./db";
import { isFeeling } from "./feelings";
import { recordPlay, removePlay, type PlayResult } from "./plays";
import { isPopcorn } from "./popcorn";
import { COMMENT_MAX } from "./social";
import {
  seasonKey,
  showStatus,
  tmdbPeek,
  tvDetailsKey,
  type MediaType,
  type MovieDetails,
  type Season,
  type TvDetails,
} from "./tmdb";

/**
 * The title pages' writes, below the actions that call them so they can be
 * tested without a request. Every viewing goes through `recordPlay` and
 * `removePlay`; nothing here touches the watched tables itself.
 */

// ---------------------------------------------------------------------------
// Leaving the watchlist

/**
 * A watchlist is what you still mean to watch, so finishing something takes
 * it off. A film goes the moment it is watched. A show goes only when the
 * whole run is done: every aired episode seen *and* the show over, because a
 * returning series you are caught up on is still something you are waiting for.
 */
export function showLeavesWatchlist(state: { status: string; airedCount: number; watchedCount: number }): boolean {
  const over = state.status === "ended" || state.status === "cancelled";
  return over && state.airedCount > 0 && state.watchedCount >= state.airedCount;
}

/**
 * Applies the rule to one show after a viewing. The status comes from the
 * cached details when there are some, since `TitleState` only learns it from
 * the refresh job and a show ticked for the first time has not been through
 * that yet. Returns whether the row went.
 */
export async function pruneShowFromWatchlist(userId: string, showId: number): Promise<boolean> {
  const [state, listed] = await Promise.all([
    db.titleState.findUnique({
      where: { userId_showId: { userId, showId } },
      select: { status: true, airedCount: true, watchedCount: true },
    }),
    db.watchlistItem.findUnique({
      where: { userId_mediaType_tmdbId: { userId, mediaType: "tv", tmdbId: showId } },
      select: { id: true },
    }),
  ]);
  if (!state || !listed) return false;
  const { path, params } = tvDetailsKey(showId);
  const details = await tmdbPeek<TvDetails>(path, params);
  const status = details ? showStatus(details.status) : state.status;
  if (!showLeavesWatchlist({ ...state, status })) return false;
  await db.watchlistItem.delete({ where: { id: listed.id } });
  return true;
}

// ---------------------------------------------------------------------------
// Viewings

type EpisodeFacts = { name: string | null; runtime: number | null; airDate: string | null };

/**
 * What an episode is called, how long it runs and when it aired: the stored
 * row when the job keeps the show, else the cached season. Never the network;
 * the page that drew the button has already put it in the cache.
 */
async function episodeFacts(showId: number, season: number, episode: number): Promise<EpisodeFacts | null> {
  const row = await db.showEpisode.findUnique({
    where: { showId_seasonNumber_episodeNumber: { showId, seasonNumber: season, episodeNumber: episode } },
    select: { name: true, runtime: true, airDate: true },
  });
  if (row) return row;
  const key = seasonKey(showId, season);
  const cached = await tmdbPeek<Season>(key.path, key.params);
  const e = cached?.episodes.find((x) => x.episode_number === episode);
  return e ? { name: e.name || null, runtime: e.runtime && e.runtime > 0 ? e.runtime : null, airDate: e.air_date } : null;
}

/** The show's name and poster: this person's row, else the cached details. */
async function showFacts(userId: string, showId: number) {
  const state = await db.titleState.findUnique({
    where: { userId_showId: { userId, showId } },
    select: { showName: true, showPoster: true },
  });
  if (state) return { title: state.showName, poster: state.showPoster };
  const { path, params } = tvDetailsKey(showId);
  const details = await tmdbPeek<TvDetails>(path, params);
  return details ? { title: details.name, poster: details.poster_path } : null;
}

/**
 * Marks one episode watched from a title or episode page. Refused for an
 * episode known not to have aired (a stale page cannot log the future) and for
 * a show nobody has opened, whose name there is no way to know. A viewing
 * from here reorders Up next, as any new information should.
 */
export async function markEpisode(
  userId: string,
  showId: number,
  season: number,
  episode: number,
  today = todayKey(),
): Promise<PlayResult | null> {
  const [show, facts] = await Promise.all([showFacts(userId, showId), episodeFacts(showId, season, episode)]);
  if (!show) return null;
  if (facts?.airDate && facts.airDate > today) return null;
  const result = await recordPlay(userId, {
    mediaType: "tv",
    tmdbId: showId,
    seasonNumber: season,
    episodeNumber: episode,
    title: show.title,
    poster: show.poster,
    episodeName: facts?.name ?? null,
    runtime: facts?.runtime ?? null,
    source: "manual",
  });
  await pruneShowFromWatchlist(userId, showId);
  return result;
}

/** Unticks an episode: every viewing of it, since the tick says "I have seen this". */
export async function unmarkEpisode(userId: string, showId: number, season: number, episode: number) {
  return removePlay(userId, { mediaType: "tv", tmdbId: showId, seasonNumber: season, episodeNumber: episode }, "all");
}

/**
 * Every aired episode of a season not already seen, one viewing each, "now".
 * Only the gaps: episodes already on record keep the date they were first
 * watched, and pressing this twice does not log a second pass through the
 * season. Unaired episodes are skipped, so a season you are current on does
 * not end up looking finished. Returns how many were logged.
 */
export async function markSeason(userId: string, showId: number, season: number, today = todayKey()): Promise<number> {
  const show = await showFacts(userId, showId);
  if (!show) return 0;

  let episodes: { episode: number; name: string | null; runtime: number | null; airDate: string | null }[] = (
    await db.showEpisode.findMany({
      where: { showId, seasonNumber: season },
      orderBy: { episodeNumber: "asc" },
      select: { episodeNumber: true, name: true, runtime: true, airDate: true },
    })
  ).map((e) => ({ episode: e.episodeNumber, name: e.name, runtime: e.runtime, airDate: e.airDate }));
  if (episodes.length === 0) {
    const key = seasonKey(showId, season);
    const cached = await tmdbPeek<Season>(key.path, key.params);
    episodes = (cached?.episodes ?? []).map((e) => ({
      episode: e.episode_number,
      name: e.name || null,
      runtime: e.runtime && e.runtime > 0 ? e.runtime : null,
      airDate: e.air_date,
    }));
  }

  const seen = new Set(
    (
      await db.watchedEpisode.findMany({
        where: { userId, showId, seasonNumber: season },
        select: { episodeNumber: true },
      })
    ).map((e) => e.episodeNumber),
  );

  let logged = 0;
  const now = new Date();
  for (const e of episodes) {
    if (seen.has(e.episode) || !e.airDate || e.airDate > today) continue;
    const result = await recordPlay(userId, {
      mediaType: "tv",
      tmdbId: showId,
      seasonNumber: season,
      episodeNumber: e.episode,
      title: show.title,
      poster: show.poster,
      episodeName: e.name,
      runtime: e.runtime,
      watchedAt: now,
      source: "manual",
    });
    if (result.created) logged += 1;
  }
  if (logged) await pruneShowFromWatchlist(userId, showId);
  return logged;
}

/** One viewing of a film, and off the watchlist at once. */
export async function markFilm(userId: string, film: MovieDetails): Promise<PlayResult> {
  const result = await recordPlay(userId, {
    mediaType: "movie",
    tmdbId: film.id,
    title: film.title,
    poster: film.poster_path,
    runtime: film.runtime,
    score: film.vote_count >= 10 ? Math.round(film.vote_average * 10) : null,
    source: "manual",
  });
  await db.watchlistItem.deleteMany({ where: { userId, mediaType: "movie", tmdbId: film.id } });
  return result;
}

// ---------------------------------------------------------------------------
// Ratings

type Described = { title: string; poster: string | null };

/** Sets or clears this person's popcorn for a film or show. */
export async function setRating(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  score: number | null,
  describe: Described,
): Promise<boolean> {
  const key = { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } };
  if (score === null) {
    await db.rating.deleteMany({ where: { userId, mediaType, tmdbId } });
    return true;
  }
  if (!isPopcorn(score)) return false;
  await db.rating.upsert({
    where: key,
    create: { userId, mediaType, tmdbId, score, title: describe.title, poster: describe.poster },
    update: { score, title: describe.title, poster: describe.poster },
  });
  return true;
}

/**
 * Sets or clears the popcorn for one episode. `liked` is the column the
 * current app's thumbs wrote; it is kept true for half full and up so a
 * rating made here still reads sensibly there.
 */
export async function setEpisodeRating(
  userId: string,
  showId: number,
  season: number,
  episode: number,
  score: number | null,
): Promise<boolean> {
  const where = { userId, showId, seasonNumber: season, episodeNumber: episode };
  if (score === null) {
    await db.episodeRating.deleteMany({ where });
    return true;
  }
  if (!isPopcorn(score)) return false;
  await db.episodeRating.upsert({
    where: { userId_showId_seasonNumber_episodeNumber: where },
    create: { ...where, score, liked: score >= 3 },
    update: { score, liked: score >= 3 },
  });
  return true;
}

export async function ratingOf(userId: string, mediaType: MediaType, tmdbId: number): Promise<number | null> {
  const row = await db.rating.findUnique({
    where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } },
    select: { score: true },
  });
  return row?.score ?? null;
}

export async function episodeRatingOf(userId: string, showId: number, season: number, episode: number) {
  const row = await db.episodeRating.findUnique({
    where: { userId_showId_seasonNumber_episodeNumber: { userId, showId, seasonNumber: season, episodeNumber: episode } },
    select: { score: true },
  });
  return row?.score ?? null;
}

// ---------------------------------------------------------------------------
// Keeping things

export async function setFavourite(userId: string, mediaType: MediaType, tmdbId: number, on: boolean, d: Described & { score: number | null }) {
  if (on) {
    await db.favourite.upsert({
      where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } },
      create: { userId, mediaType, tmdbId, title: d.title, poster: d.poster, score: d.score },
      update: {},
    });
  } else {
    await db.favourite.deleteMany({ where: { userId, mediaType, tmdbId } });
  }
}

export async function setSaved(userId: string, mediaType: MediaType, tmdbId: number, on: boolean, d: Described & { score: number | null }) {
  if (on) {
    await db.watchlistItem.upsert({
      where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } },
      create: { userId, mediaType, tmdbId, title: d.title, poster: d.poster, score: d.score },
      update: {},
    });
  } else {
    await db.watchlistItem.deleteMany({ where: { userId, mediaType, tmdbId } });
  }
}

/**
 * "Stop watching": the history stays exactly where it is; the show only drops
 * out of Up next and the calendar. Undone the same way.
 */
export async function setDropped(userId: string, showId: number, showName: string, dropped: boolean) {
  if (dropped) {
    await db.droppedShow.upsert({
      where: { userId_showId: { userId, showId } },
      create: { userId, showId, showName },
      update: {},
    });
  } else {
    await db.droppedShow.deleteMany({ where: { userId, showId } });
  }
}

/**
 * Whether "Stop watching" means anything: not on a finished show watched to
 * the end, where there is nothing left to be reminded about.
 */
export function canStopWatching(state: { status: string; airedCount: number; watchedCount: number } | null) {
  if (!state) return true;
  return !showLeavesWatchlist(state);
}

// ---------------------------------------------------------------------------
// Feelings and comments

/** One feeling per person per film or episode; the same answer again clears it. */
export async function setFeeling(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  season: number,
  episode: number,
  feeling: string | null,
): Promise<boolean> {
  const key = { userId, mediaType, tmdbId, seasonNumber: season, episodeNumber: episode };
  if (feeling === null) {
    await db.feeling.deleteMany({ where: key });
    return true;
  }
  if (!isFeeling(feeling)) return false;
  await db.feeling.upsert({
    where: { userId_mediaType_tmdbId_seasonNumber_episodeNumber: key },
    create: { ...key, feeling },
    update: { feeling },
  });
  return true;
}

export async function addComment(userId: string, mediaType: MediaType, tmdbId: number, body: string) {
  const text = body.trim();
  if (!text || text.length > COMMENT_MAX) return null;
  return db.comment.create({ data: { userId, mediaType, tmdbId, body: text }, select: { id: true } });
}

/** Only your own, and its replies go with it. */
export async function deleteComment(userId: string, id: string) {
  const { count } = await db.comment.deleteMany({ where: { id, userId } });
  return count > 0;
}
