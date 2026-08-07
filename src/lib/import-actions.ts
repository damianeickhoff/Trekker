"use server";

import { revalidatePath } from "next/cache";
import { syncUnlocks } from "./achievements";
import { absorbImport } from "./achievements/xp";
import { requireUser } from "./auth";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { recordNewEpisodePlays, recordPlay, setPlayDate } from "./plays";
import { getMovie, getTv, tmdbConfigured } from "./tmdb";
import {
  defaultTraktClientId,
  getWatchedMovies,
  getWatchedShows,
  TraktError,
  type TraktMovie,
  type TraktShow,
} from "./trakt";
import { parseTraktExport, TraktExportError } from "./trakt-export";

export type ImportState = {
  error?: string;
  summary?: { movies: number; episodes: number; updated: number; skipped: number };
};

// Bounds so one import cannot spend hours resolving runtimes against TMDB.
const MAX_MOVIES = 400;
const MAX_SHOWS = 200;
// How many TMDB lookups to keep in flight at once.
const FANOUT = 6;
// A full Trakt export of a heavy watcher is a couple of megabytes.
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

/**
 * Reads the signed-in user's saved Trakt account — there is nothing to fill in
 * at import time, the credentials live in their settings.
 */
export async function importFromTrakt(): Promise<ImportState> {
  const user = await requireUser();

  if (!tmdbConfigured()) return { error: "TMDB_API_KEY is not set on the server" };

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { traktUsername: true, traktClientId: true },
  });

  const username = account?.traktUsername?.trim();
  const clientId = account?.traktClientId?.trim() || defaultTraktClientId();

  if (!username) return { error: "Save your Trakt username first" };
  if (!clientId) return { error: "Save a Trakt client id first" };

  let movies, shows;
  try {
    [movies, shows] = await Promise.all([
      getWatchedMovies(username, clientId),
      getWatchedShows(username, clientId),
    ]);
  } catch (error) {
    if (error instanceof TraktError) return { error: error.message };
    return { error: "Could not reach Trakt" };
  }

  return ingest(user.id, movies, shows);
}

/**
 * The same import from a Trakt data export instead of the API. Every account
 * can request one of those; the API needs a VIP client id.
 */
export async function importTraktExport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();

  if (!tmdbConfigured()) return { error: "TMDB_API_KEY is not set on the server" };

  const file = formData.get("export");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your export file" };
  if (file.size > MAX_EXPORT_BYTES) return { error: "That file is larger than 64 MB" };

  let history;
  try {
    history = parseTraktExport(
      Buffer.from(await file.arrayBuffer()),
      file.name,
    );
  } catch (error) {
    if (error instanceof TraktExportError) return { error: error.message };
    return { error: "Could not read that file" };
  }

  return ingest(user.id, history.movies, history.shows);
}

/** Resolves Trakt rows against TMDB and writes what is not already logged. */
async function ingest(
  userId: string,
  movies: TraktMovie[],
  shows: TraktShow[],
): Promise<ImportState> {
  const user = { id: userId };
  let skipped = 0;
  /**
   * Trakt is the record of when you actually watched something; Trekker's own
   * timestamp is only ever "when you ticked the box". So an import corrects the
   * dates on rows that already exist rather than leaving them alone.
   *
   * Trakt reports only `last_watched_at`, never a play log, so it can never tell
   * us about a rewatch — which makes correcting the *newest* play exactly the
   * right move, since that is the one Trakt is talking about. Appending instead
   * would double-count the single viewing the two sides both already know.
   */
  const corrections: Promise<unknown>[] = [];
  let updated = 0;

  function correct(when: Date, current: Date, apply: (when: Date) => Promise<unknown>) {
    // A minute of slack: re-importing the same export should be a no-op.
    if (Math.abs(when.getTime() - current.getTime()) < 60_000) return;
    if (Number.isNaN(when.getTime())) return;
    updated += 1;
    corrections.push(apply(when));
  }

  // ---- Movies -------------------------------------------------------------
  const usableMovies = movies.filter((m) => m.movie.ids.tmdb !== null).slice(0, MAX_MOVIES);
  skipped += movies.length - usableMovies.length;

  const existingMovieRows = await db.watchedMovie.findMany({
    where: { userId: user.id },
    select: { id: true, movieId: true, watchedAt: true, lastWatchedAt: true },
  });
  const existingMovies = new Map(existingMovieRows.map((m) => [m.movieId, m]));

  for (const entry of usableMovies) {
    const existing = existingMovies.get(entry.movie.ids.tmdb!);
    if (!existing) continue;
    correct(
      new Date(entry.last_watched_at),
      existing.lastWatchedAt ?? existing.watchedAt,
      (watchedAt) =>
        setPlayDate(user.id, { mediaType: "movie", tmdbId: existing.movieId }, watchedAt),
    );
  }

  const movieDetails = await mapLimit(
    usableMovies.filter((m) => !existingMovies.has(m.movie.ids.tmdb!)),
    FANOUT,
    async (entry) => ({
      entry,
      detail: await getMovie(entry.movie.ids.tmdb!).catch(() => null),
    }),
  );

  let movieCount = 0;
  for (const { entry, detail } of movieDetails) {
    if (!detail) {
      skipped += 1;
      continue;
    }

    const watchedAt = new Date(entry.last_watched_at);
    const result = await recordPlay(user.id, {
      mediaType: "movie",
      tmdbId: detail.id,
      title: detail.title,
      poster: detail.poster_path,
      runtime: detail.runtime ?? 0,
      score: Math.round(detail.vote_average * 10),
      watchedAt,
      source: "trakt",
      // Re-running the same import collides here and does nothing, which is what
      // the minute of slack above was reaching for.
      sourceRef: `movie:${detail.id}:${watchedAt.toISOString()}`,
    });
    if (result.created) movieCount += 1;
  }

  // ---- Episodes -----------------------------------------------------------
  const episodeRows: {
    showId: number;
    showName: string;
    showPoster: string | null;
    seasonNumber: number;
    episodeNumber: number;
    episodeName: string;
    runtime: number;
    watchedAt: Date;
  }[] = [];

  const usableShows = shows.filter((s) => s.show.ids.tmdb !== null).slice(0, MAX_SHOWS);
  skipped += shows.length - usableShows.length;

  const existingEpisodeRows = await db.watchedEpisode.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      showId: true,
      seasonNumber: true,
      episodeNumber: true,
      watchedAt: true,
      lastWatchedAt: true,
    },
  });
  const existingEpisodes = new Map(
    existingEpisodeRows.map((e) => [`${e.showId}-${e.seasonNumber}-${e.episodeNumber}`, e]),
  );

  const showDetails = await mapLimit(usableShows, FANOUT, async (entry) => ({
    entry,
    detail: await getTv(entry.show.ids.tmdb!).catch(() => null),
  }));

  for (const { entry, detail } of showDetails) {
    if (!detail) {
      skipped += 1;
      continue;
    }

    const runtime = detail.episode_run_time?.[0] ?? 42;

    for (const season of entry.seasons ?? []) {
      // Specials sit outside the numbered run and are not tracked here.
      if (season.number === 0) continue;

      for (const episode of season.episodes) {
        const key = `${detail.id}-${season.number}-${episode.number}`;
        const when = new Date(episode.last_watched_at ?? entry.last_watched_at);

        const existing = existingEpisodes.get(key);
        if (existing) {
          correct(when, existing.lastWatchedAt ?? existing.watchedAt, (watchedAt) =>
            setPlayDate(
              user.id,
              {
                mediaType: "tv",
                tmdbId: existing.showId,
                seasonNumber: existing.seasonNumber,
                episodeNumber: existing.episodeNumber,
              },
              watchedAt,
            ),
          );
          continue;
        }

        // Placeholder so a duplicate inside the same import is not written
        // twice; the row it stands for is created below.
        existingEpisodes.set(key, {
          id: "",
          showId: detail.id,
          seasonNumber: season.number,
          episodeNumber: episode.number,
          watchedAt: when,
          lastWatchedAt: when,
        });

        episodeRows.push({
          showId: detail.id,
          showName: detail.name,
          showPoster: detail.poster_path,
          seasonNumber: season.number,
          episodeNumber: episode.number,
          // Trakt does not carry episode titles here; the season browser shows
          // the real name from TMDB either way.
          episodeName: `Episode ${episode.number}`,
          runtime,
          watchedAt: when,
        });
      }
    }
  }

  // Every row here was checked against what is already on record above, so this
  // is a straight bulk write rather than a play-by-play reconciliation.
  await recordNewEpisodePlays(user.id, episodeRows);

  // Date corrections are independent of each other and of the inserts above.
  if (corrections.length > 0) await Promise.all(corrections);

  // Everything this import turned up belongs to the history it brought in, not
  // to the level: the plays carry their own source, and the badges it satisfied
  // are marked as carried here.
  await absorbImport(user.id, await syncUnlocks(user.id, { carried: true }));

  revalidatePath("/", "layout");
  return {
    summary: { movies: movieCount, episodes: episodeRows.length, updated, skipped },
  };
}
