import "server-only";
import { syncUnlocks } from "./achievements";
import { absorbImport } from "./achievements/xp";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import type { ImportSummary, Report } from "./import-jobs";
import { recordNewEpisodePlays, recordPlay, setPlayDate } from "./plays";
import { getMovie, getTv } from "./tmdb";
import type { TraktMovie, TraktShow } from "./trakt";

/**
 * The work an import actually does, apart from whatever started it.
 *
 * It lives here rather than in `import-actions` because it is no longer called
 * from a server action: a run takes minutes, and a module marked `"use server"`
 * can only export things that are safe to hand to the browser. See
 * `import-jobs` for why the request stopped waiting for this.
 */

// Bounds so one import cannot spend hours resolving runtimes against TMDB.
const MAX_MOVIES = 400;
const MAX_SHOWS = 200;
// How many TMDB lookups to keep in flight at once.
const FANOUT = 6;

/** Resolves Trakt rows against TMDB and writes what is not already logged. */
export async function ingest(
  userId: string,
  movies: TraktMovie[],
  shows: TraktShow[],
  report: Report = () => {},
): Promise<ImportSummary> {
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

  report({ stage: "Reading what is already logged" });

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

  const newMovies = usableMovies.filter((m) => !existingMovies.has(m.movie.ids.tmdb!));

  report({ stage: "Matching films to TMDB", total: newMovies.length });
  let matched = 0;
  const movieDetails = await mapLimit(newMovies, FANOUT, async (entry) => {
    const detail = await getMovie(entry.movie.ids.tmdb!).catch(() => null);
    report({ done: ++matched });
    return { entry, detail };
  });

  report({ stage: "Logging films", total: movieDetails.length });
  let movieCount = 0;
  let loggedMovies = 0;
  for (const { entry, detail } of movieDetails) {
    report({ done: ++loggedMovies });

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

  report({ stage: "Matching shows to TMDB", total: usableShows.length });
  let matchedShows = 0;
  const showDetails = await mapLimit(usableShows, FANOUT, async (entry) => {
    const detail = await getTv(entry.show.ids.tmdb!).catch(() => null);
    report({ done: ++matchedShows });
    return { entry, detail };
  });

  report({ stage: "Working out which episodes are new", total: showDetails.length });
  let walked = 0;
  for (const { entry, detail } of showDetails) {
    report({ done: ++walked });

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
  // is a straight bulk write rather than a play-by-play reconciliation. It is
  // one call, so the count can only be reported either side of it.
  report({ stage: "Writing episodes", total: episodeRows.length });
  await recordNewEpisodePlays(user.id, episodeRows);
  report({ done: episodeRows.length });

  // Date corrections are independent of each other and of the inserts above.
  if (corrections.length > 0) {
    report({ stage: "Correcting watch dates", total: corrections.length });
    await Promise.all(corrections);
    report({ done: corrections.length });
  }

  // Everything this import turned up belongs to the history it brought in, not
  // to the level: the plays carry their own source, and the badges it satisfied
  // are marked as carried here.
  report({ stage: "Catching the badges up" });
  await absorbImport(user.id, await syncUnlocks(user.id, { carried: true }));

  /**
   * No `revalidatePath` here, deliberately. This runs on after the request that
   * started it has been answered, and cache revalidation belongs to a request
   * that is still open — there is none to attach it to by the time an import
   * finishes. The page that is watching the job calls `router.refresh()` when it
   * sees the run finish, which is the same invalidation asked for by the one
   * party that is definitely still around.
   */
  return { movies: movieCount, episodes: episodeRows.length, updated, skipped };
}
