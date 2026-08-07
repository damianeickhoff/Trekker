"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "./db";
import { getCurrentUser, requireUser } from "./auth";
import { mapLimit } from "./concurrency";
import { countAiredEpisodes, getSeason, getTv } from "./tmdb";
import { hasPlexAccess } from "./plex-access";
import { getSeerrConnection, requestOnSeerr } from "./seerr";
import {
  clearShow,
  deletePlays,
  recordEpisodeRewatches,
  recordNewEpisodePlays,
  recordPlay,
  setPlayDate,
  type EpisodeRewatch,
  type NewEpisodePlay,
} from "./plays";
import { scheduleUnlockCheck } from "./achievements";

const mediaType = z.enum(["movie", "tv"]);

/** Anything that changes tracking data touches these views. */
function revalidateTracking(userId?: string) {
  revalidatePath("/", "layout");
  // Logging something is the only thing that can earn a badge, so this is the
  // moment worth looking. Throttled and un-awaited inside.
  if (userId) scheduleUnlockCheck(userId);
}

/**
 * A watchlist is a list of things you still mean to watch, so anything you have
 * finished drops off it. For a show "finished" means the whole run: every aired
 * episode watched *and* the show itself over, since a returning series you are
 * caught up on is still something you are waiting for.
 */
async function pruneWatchlist(userId: string, mediaType: "movie" | "tv", tmdbId: number) {
  await db.watchlistItem
    .delete({ where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } } })
    .catch(() => undefined);
}

async function pruneShowIfComplete(userId: string, showId: number) {
  const queued = await db.watchlistItem.findUnique({
    where: { userId_mediaType_tmdbId: { userId, mediaType: "tv", tmdbId: showId } },
  });
  // Nothing on the list: no reason to spend a TMDB call working it out.
  if (!queued) return;

  const show = await getTv(showId).catch(() => null);
  if (!show) return;
  if (show.status !== "Ended" && show.status !== "Canceled") return;

  const aired = countAiredEpisodes(show);
  if (aired === 0) return;

  const watched = await db.watchedEpisode.count({ where: { userId, showId } });
  if (watched >= aired) await pruneWatchlist(userId, "tv", showId);
}

/**
 * Whether a plain `YYYY-MM-DD` air or release date has arrived. Compared as
 * dates, not instants — TMDB's carry no time or zone, so anything that turns
 * one into a timestamp puts today's release on the wrong side of the line for
 * half the world. A missing date means unreleased: TMDB leaves it blank until
 * something is scheduled.
 *
 * The date itself comes from the caller, which already has it on screen. The
 * check is here so a stale page cannot log an episode that has not aired; it is
 * a guard rail, not a trust boundary.
 */
function hasBeenReleased(date: string | null | undefined) {
  if (!date) return false;
  return date <= new Date().toISOString().slice(0, 10);
}

/** Parses the optional "I watched this earlier" date from a tracking call. */
function watchedAtFrom(value: string | Date | null | undefined) {
  if (!value) return undefined;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  // A date in the future is a mistake, not a plan.
  return date.getTime() > Date.now() ? new Date() : date;
}

export async function toggleWatchlist(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster?: string | null;
  score?: number | null;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = z
    .object({
      mediaType,
      tmdbId: z.number().int(),
      title: z.string().min(1),
      poster: z.string().nullish(),
      score: z.number().int().nullish(),
    })
    .parse(input);

  const existing = await db.watchlistItem.findUnique({
    where: {
      userId_mediaType_tmdbId: {
        userId: user.id,
        mediaType: data.mediaType,
        tmdbId: data.tmdbId,
      },
    },
  });

  if (existing) {
    await db.watchlistItem.delete({ where: { id: existing.id } });
  } else {
    await db.watchlistItem.create({
      data: {
        userId: user.id,
        mediaType: data.mediaType,
        tmdbId: data.tmdbId,
        title: data.title,
        poster: data.poster ?? null,
        score: data.score ?? null,
      },
    });
  }

  revalidateTracking(user.id);
  return { inWatchlist: !existing };
}

export async function toggleMovieWatched(input: {
  movieId: number;
  title: string;
  poster?: string | null;
  runtime?: number | null;
  score?: number | null;
  /** ISO date. Omitted means "just now", which is the common case. */
  watchedAt?: string | null;
  /** TMDB release date, so an unreleased film cannot be logged. */
  releaseDate?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await db.watchedMovie.findUnique({
    where: { userId_movieId: { userId: user.id, movieId: input.movieId } },
  });

  if (existing) {
    // Clearing a film means every viewing of it: "I have not seen this."
    await deletePlays(user.id, { mediaType: "movie", tmdbId: input.movieId }, "all");
  } else {
    if (input.releaseDate !== undefined && !hasBeenReleased(input.releaseDate)) {
      return { watched: false };
    }

    await recordPlay(user.id, {
      mediaType: "movie",
      tmdbId: input.movieId,
      title: input.title,
      poster: input.poster,
      runtime: input.runtime,
      score: input.score,
      watchedAt: watchedAtFrom(input.watchedAt),
    });
    // Watching it means it is no longer pending.
    await pruneWatchlist(user.id, "movie", input.movieId);
  }

  revalidateTracking(user.id);
  return { watched: !existing };
}

/**
 * Logs another viewing of something already on record — a film, or one episode.
 *
 * Separate from the toggles because the second press of a toggle has two
 * plausible meanings, "again" and "undo", and the destructive one is the
 * surprising one. Both this and unwatching live in the date menu instead, which
 * keeps the number of controls on a title page the same as it ever was.
 */
export async function logRewatch(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster?: string | null;
  runtime?: number | null;
  /** Films only — a score belongs to the title, not the viewing. */
  score?: number | null;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  watchedAt?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await recordPlay(user.id, {
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
    title: input.title,
    poster: input.poster,
    runtime: input.runtime,
    score: input.score,
    seasonNumber: input.seasonNumber,
    episodeNumber: input.episodeNumber,
    episodeName: input.episodeName,
    watchedAt: watchedAtFrom(input.watchedAt),
  });

  revalidateTracking(user.id);
  // `created` is false when this landed inside the duplicate window. The count
  // is the real one either way, which is what the caller must show.
  return { created: result.created, plays: result.plays, lastWatchedAt: result.lastWatchedAt };
}

/** Removes the most recent viewing, or all of them. */
export async function removeWatch(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
  mode: "last" | "all";
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { remaining, lastWatchedAt } = await deletePlays(
    user.id,
    {
      mediaType: input.mediaType,
      tmdbId: input.tmdbId,
      seasonNumber: input.seasonNumber ?? null,
      episodeNumber: input.episodeNumber ?? null,
    },
    input.mode,
  );

  revalidateTracking(user.id);
  return { plays: remaining, watched: remaining > 0, lastWatchedAt };
}

/** Corrects when something was watched, after the fact. */
export async function setMovieWatchedAt(movieId: number, watchedAt: string, playId?: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const date = watchedAtFrom(watchedAt);
  if (!date) return { ok: false, lastWatchedAt: null };

  const result = await setPlayDate(user.id, { mediaType: "movie", tmdbId: movieId }, date, playId);

  revalidateTracking(user.id);
  return result;
}

export async function setEpisodeWatchedAt(input: {
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  playId?: string;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const date = watchedAtFrom(input.watchedAt);
  if (!date) return { ok: false, lastWatchedAt: null };

  const result = await setPlayDate(
    user.id,
    {
      mediaType: "tv",
      tmdbId: input.showId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
    },
    date,
    input.playId,
  );

  revalidateTracking(user.id);
  return result;
}

export type EpisodeInput = {
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  runtime?: number | null;
  /** TMDB air date, so an episode that has not aired cannot be logged. */
  airDate?: string | null;
};

export async function toggleEpisodeWatched(input: {
  showId: number;
  showName: string;
  showPoster?: string | null;
  episode: EpisodeInput;
  /** ISO date. Omitted means "just now". */
  watchedAt?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { showId, showName, showPoster, episode } = input;
  const key = {
    userId: user.id,
    showId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  };

  const existing = await db.watchedEpisode.findUnique({
    where: { userId_showId_seasonNumber_episodeNumber: key },
  });

  const target = {
    mediaType: "tv" as const,
    tmdbId: showId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  };

  if (existing) {
    await deletePlays(user.id, target, "all");
  } else {
    if (episode.airDate !== undefined && !hasBeenReleased(episode.airDate)) {
      return { watched: false };
    }

    await recordPlay(user.id, {
      ...target,
      title: showName,
      poster: showPoster,
      episodeName: episode.episodeName,
      runtime: episode.runtime || 42,
      watchedAt: watchedAtFrom(input.watchedAt),
    });
    await pruneShowIfComplete(user.id, showId);
  }

  revalidateTracking(user.id);
  return { watched: !existing };
}

/**
 * Which of a set of episodes are not already on record.
 *
 * Marking a season or a show used to clear it and re-insert it whole, because
 * SQLite has no `skipDuplicates`. That threw away the original watch dates every
 * time — and with a play log behind it, it would also invent a rewatch of every
 * episode on each press. Working out the difference first is what both problems
 * turn out to need.
 */
async function unwatchedOf<T extends { seasonNumber: number; episodeNumber: number }>(
  userId: string,
  showId: number,
  rows: T[],
): Promise<T[]> {
  const existing = new Set(
    (
      await db.watchedEpisode.findMany({
        where: { userId, showId },
        select: { seasonNumber: true, episodeNumber: true },
      })
    ).map((e) => `${e.seasonNumber}-${e.episodeNumber}`),
  );

  return rows.filter((row) => !existing.has(`${row.seasonNumber}-${row.episodeNumber}`));
}

/** Marks (or clears) every episode of a season in one go. */
export async function setSeasonWatched(input: {
  showId: number;
  showName: string;
  showPoster?: string | null;
  seasonNumber: number;
  episodes: EpisodeInput[];
  watched: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (input.watched) {
    // Unaired episodes are skipped, the same way `setShowWatched` does it: a
    // season you are current on should not end up looking finished.
    const releasable = input.episodes.filter(
      (e) => e.airDate === undefined || hasBeenReleased(e.airDate),
    );

    // Only the gaps are filled: episodes already on record keep the date they
    // were first watched, and pressing this twice does not log a second viewing
    // of the whole season.
    const missing = await unwatchedOf(
      user.id,
      input.showId,
      releasable.map((e) => ({
        showId: input.showId,
        showName: input.showName,
        showPoster: input.showPoster ?? null,
        seasonNumber: input.seasonNumber,
        episodeNumber: e.episodeNumber,
        episodeName: e.episodeName,
        runtime: e.runtime || 42,
      })),
    );

    await recordNewEpisodePlays(user.id, missing);
  } else {
    await clearShow(user.id, input.showId, input.seasonNumber);
  }

  if (input.watched) await pruneShowIfComplete(user.id, input.showId);

  revalidateTracking(user.id);
  return { watched: input.watched };
}

/**
 * Every aired episode of a show, shaped for the bulk play writers.
 *
 * Null means TMDB could not be reached, which callers must not confuse with a
 * show that has aired nothing — one is an error worth reporting and the other
 * is simply nothing to do.
 */
async function airedEpisodeRows(
  showId: number,
  showName: string,
  showPoster?: string | null,
): Promise<EpisodeRewatch[] | null> {
  const show = await getTv(showId).catch(() => null);
  if (!show) return null;

  const seasons = show.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);
  const fallbackRuntime = show.episode_run_time?.[0] ?? 42;
  const today = Date.now();

  const details = await Promise.all(
    seasons.map((s) => getSeason(showId, s.season_number).catch(() => null)),
  );

  const rows: EpisodeRewatch[] = [];

  for (const season of details) {
    if (!season) continue;
    for (const episode of season.episodes) {
      const aired =
        episode.air_date && new Date(`${episode.air_date}T00:00:00Z`).getTime() <= today;
      if (!aired) continue;

      rows.push({
        showId,
        showName,
        showPoster: showPoster ?? null,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        episodeName: episode.name,
        runtime: episode.runtime || fallbackRuntime,
      });
    }
  }

  return rows;
}

/**
 * Marks (or clears) every released episode of a show. Unaired episodes are
 * skipped so a show you are current on does not look finished.
 */
export async function setShowWatched(input: {
  showId: number;
  showName: string;
  showPoster?: string | null;
  watched: boolean;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!input.watched) {
    await clearShow(user.id, input.showId);
    revalidateTracking(user.id);
    return { episodes: 0 };
  }

  const rows = await airedEpisodeRows(input.showId, input.showName, input.showPoster);
  if (!rows) return { episodes: 0, error: "Could not load the episode list" };
  if (rows.length === 0) return { episodes: 0 };

  // Existing episodes keep their dates; only what is missing is logged.
  const missing = await unwatchedOf(user.id, input.showId, rows);
  await recordNewEpisodePlays(user.id, missing);

  await pruneShowIfComplete(user.id, input.showId);

  revalidateTracking(user.id);
  return { episodes: missing.length };
}

/**
 * "I watched that season again" — another viewing of every aired episode in it.
 *
 * Deliberately not the same thing as marking the season watched, which fills
 * gaps and leaves existing history untouched. This is the opposite: it adds to
 * every episode's count, because sitting through the season a second time is
 * exactly what the play log is for.
 *
 * The episode list is handed in rather than fetched, since the season browser
 * already has it on screen.
 */
export async function logSeasonRewatch(input: {
  showId: number;
  showName: string;
  showPoster?: string | null;
  seasonNumber: number;
  episodes: EpisodeInput[];
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows: EpisodeRewatch[] = input.episodes
    .filter((e) => e.airDate === undefined || hasBeenReleased(e.airDate))
    .map((e) => ({
      showId: input.showId,
      showName: input.showName,
      showPoster: input.showPoster ?? null,
      seasonNumber: input.seasonNumber,
      episodeNumber: e.episodeNumber,
      episodeName: e.episodeName,
      runtime: e.runtime || 42,
    }));

  const episodes = await recordEpisodeRewatches(user.id, rows);

  revalidateTracking(user.id);
  return { episodes };
}

/** The same, for every aired episode of every season. */
export async function logShowRewatch(input: {
  showId: number;
  showName: string;
  showPoster?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await airedEpisodeRows(input.showId, input.showName, input.showPoster);
  if (!rows) return { episodes: 0, error: "Could not load the episode list" };

  const episodes = await recordEpisodeRewatches(user.id, rows);

  revalidateTracking(user.id);
  return { episodes };
}

/**
 * An air date as an instant, at local midday.
 *
 * Midday rather than midnight for the same reason the date shortcuts use it: a
 * date-only answer landing on a day boundary can be pushed onto the wrong day
 * by a timezone shift, and "watched on the day it aired" reading as the day
 * before is exactly the kind of wrong nobody would think to look for.
 */
function airedAt(airDate: string | null | undefined) {
  if (!airDate) return undefined;
  const date = new Date(`${airDate}T12:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * "I was up to here" — logs every aired episode from the start of the show up
 * to and including the one given, and leaves everything after it alone.
 *
 * The single most tedious thing in a watch tracker is telling it about a show
 * you started years ago, one tick at a time. This is that job in one action.
 */
export async function catchUpTo(input: {
  showId: number;
  showName: string;
  showPoster?: string | null;
  seasonNumber: number;
  episodeNumber: number;
  /**
   * When to say these were watched. "now" stamps the lot with the current time,
   * which is right after a binge; "aired" gives each episode the day it went
   * out, which is right for a show you followed live and are only now telling
   * Trekker about. Defaulted rather than required so existing callers keep the
   * behaviour they had.
   */
  when?: "now" | "aired";
  /**
   * How far back "everything before" reaches. `season` stops at the first
   * episode of the chosen season; `all` carries on into the ones before it.
   *
   * The distinction matters to anyone who has skipped a season, or who watched
   * a show out of order years ago: filling in the whole history is a much
   * bigger claim than filling in the season they are sitting in, and it should
   * not be the only thing on offer.
   */
  scope?: "season" | "all";
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const show = await getTv(input.showId).catch(() => null);
  if (!show) return { episodes: 0, error: "Could not load the episode list" };

  const seasons = show.seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .filter((s) =>
      input.scope === "season"
        ? s.season_number === input.seasonNumber
        : s.season_number <= input.seasonNumber,
    )
    .sort((a, b) => a.season_number - b.season_number);

  const fallbackRuntime = show.episode_run_time?.[0] ?? 42;
  const details = await mapLimit(seasons, 4, (s) =>
    getSeason(input.showId, s.season_number).catch(() => null),
  );

  const rows: NewEpisodePlay[] = [];

  for (const season of details) {
    for (const episode of season?.episodes ?? []) {
      // Stop exactly at the chosen episode, and never log the unaired.
      if (episode.season_number > input.seasonNumber) continue;
      if (
        episode.season_number === input.seasonNumber &&
        episode.episode_number > input.episodeNumber
      ) {
        continue;
      }
      if (!hasBeenReleased(episode.air_date)) continue;

      rows.push({
        showId: input.showId,
        showName: input.showName,
        showPoster: input.showPoster ?? null,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        episodeName: episode.name,
        runtime: episode.runtime || fallbackRuntime,
        // Left undefined for "now", so the columns' own `now()` defaults apply
        // and every episode in the run shares one timestamp.
        watchedAt: input.when === "aired" ? airedAt(episode.air_date) : undefined,
      });
    }
  }

  if (rows.length === 0) return { episodes: 0 };

  // Existing rows keep their own watch dates; only the gaps are filled.
  const missing = await unwatchedOf(user.id, input.showId, rows);
  await recordNewEpisodePlays(user.id, missing);

  await pruneShowIfComplete(user.id, input.showId);

  revalidateTracking(user.id);
  return { episodes: missing.length };
}

export async function rateTitle(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster?: string | null;
  score: number;
  review?: string;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = z
    .object({
      mediaType,
      tmdbId: z.number().int(),
      title: z.string().min(1),
      poster: z.string().nullish(),
      score: z.number().int().min(1).max(100),
      review: z.string().max(4000).optional(),
    })
    .parse(input);

  await db.rating.upsert({
    where: {
      userId_mediaType_tmdbId: {
        userId: user.id,
        mediaType: data.mediaType,
        tmdbId: data.tmdbId,
      },
    },
    create: {
      userId: user.id,
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
      title: data.title,
      poster: data.poster ?? null,
      score: data.score,
      review: data.review || null,
    },
    update: { score: data.score, review: data.review || null },
  });

  revalidateTracking(user.id);
  return { score: data.score };
}

/**
 * The paragraph, separately from the score.
 *
 * `updateMany` rather than `upsert` on purpose: a review hangs off an existing
 * `Rating` row, so there is nothing to create here. If the user has not scored
 * the title yet there is no row to write to, and saying so is more honest than
 * inventing a score to hang the words on. `saved: false` is what the editor
 * shows that message from.
 */
export async function saveReview(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  review: string;
}) {
  const user = await requireUser();

  const data = z
    .object({
      mediaType,
      tmdbId: z.number().int(),
      review: z.string().max(4000),
    })
    .parse(input);

  const text = data.review.trim();

  const { count } = await db.rating.updateMany({
    where: { userId: user.id, mediaType: data.mediaType, tmdbId: data.tmdbId },
    // Empty means deleted, not stored blank — otherwise "" would count towards
    // the reviews-written badge and show as an empty card to friends.
    data: { review: text || null },
  });

  revalidateTracking(user.id);
  return { saved: count > 0, review: text || null };
}

/**
 * Thumbs up or down on one episode. Passing the verdict it already has clears
 * it, so the same button both sets and unsets — there is no third state to
 * explain and no separate "remove" control to find.
 */
export async function rateEpisode(input: {
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  liked: boolean;
}) {
  const user = await requireUser();

  const data = z
    .object({
      showId: z.number().int(),
      seasonNumber: z.number().int().min(0),
      episodeNumber: z.number().int().min(0),
      liked: z.boolean(),
    })
    .parse(input);

  const key = {
    userId_showId_seasonNumber_episodeNumber: {
      userId: user.id,
      showId: data.showId,
      seasonNumber: data.seasonNumber,
      episodeNumber: data.episodeNumber,
    },
  };

  const existing = await db.episodeRating.findUnique({ where: key });

  if (existing?.liked === data.liked) {
    await db.episodeRating.delete({ where: key }).catch(() => undefined);
    return { liked: null as boolean | null };
  }

  await db.episodeRating.upsert({
    where: key,
    create: { userId: user.id, ...data },
    update: { liked: data.liked },
  });

  return { liked: data.liked };
}

/**
 * Files a request on the user's Overseerr / Jellyseerr instance.
 *
 * `seasons` is optional and only means anything for a show. Left out, the whole
 * series is requested, which is what a film does and what the button always did.
 */
export async function requestTitle(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  seasons?: number[];
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = z
    .object({
      mediaType,
      tmdbId: z.number().int(),
      seasons: z.array(z.number().int().min(1)).optional(),
    })
    .parse(input);

  /**
   * The gate, and it lives here rather than only on the button.
   *
   * Hiding a control is a courtesy to the person who cannot use it; it is not
   * access control, because the action behind it is a network endpoint anybody
   * with an account can call. Requesting spends the owner's disk on the owner's
   * server, so the check has to be on this side of that call.
   */
  if (!(await hasPlexAccess(user.id))) {
    return {
      ok: false,
      error: "Requesting is limited to people with access to this Plex server.",
    };
  }

  const connection = await getSeerrConnection();
  if (!connection) return { ok: false, error: "No Overseerr instance is connected" };

  const ok = await requestOnSeerr(connection, data.mediaType, data.tmdbId, data.seasons);
  if (!ok) return { ok: false, error: "Overseerr rejected the request" };

  revalidateTracking(user.id);
  return { ok: true };
}

export async function clearRating(input: { mediaType: "movie" | "tv"; tmdbId: number }) {
  const user = await requireUser();
  await db.rating
    .delete({
      where: {
        userId_mediaType_tmdbId: {
          userId: user.id,
          mediaType: input.mediaType,
          tmdbId: input.tmdbId,
        },
      },
    })
    .catch(() => undefined);
  revalidateTracking(user.id);
}
