import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { recordPlay, type PlayInput } from "./plays";
import { popcornFromPercent } from "./popcorn";
import { queue, startBackfill } from "./refresh";
import { episodeLength, filmLength } from "./runtime";
import { getMovieDetails, getTvDetails, tmdbConfigured, type MovieDetails, type TvDetails } from "./tmdb";
import type { TraktBundle } from "./trakt";

/**
 * A Trakt bundle, written in: history as plays, ratings as popcorn, the
 * watchlist as watchlist rows. Behind the request that started it, with its
 * progress on the account like the backfill's, so Home draws a card from a
 * row; when it ends it starts the backfill, which works out where the person
 * is in each show and then runs the badges page's full pass.
 *
 * Nothing already known is doubled. A title or episode already watched is
 * left alone, unless the only record of it is a play some other import made
 * without saying which viewing it was (the backfill's, the current app's
 * Trakt or Plex rows): `recordPlay` adopts that row and takes Trakt's date,
 * which is the better one. A manual tick is never second-guessed. Re-running
 * an import therefore changes nothing. Ratings never replace one made here,
 * and the watchlist only gains.
 */

/** Bounds on one run, the current app's, so an import cannot spend hours on TMDB. */
export const IMPORT_CAPS = { movies: 400, shows: 200 } as const;

export type ImportSummary = { films: number; episodes: number; ratings: number; saved: number; already: number; skipped: number };

type Schedule = <T>(key: string, task: () => Promise<T>) => Promise<T>;
type Progress = (stage: string, total: number, done: number) => Promise<void>;

const ADOPTABLE = ["backfill", "trakt", "plex"];

const iso = (s: string | null | undefined) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

export async function importBundle(
  userId: string,
  bundle: TraktBundle,
  options: { schedule?: Schedule; progress?: Progress } = {},
): Promise<ImportSummary> {
  const schedule: Schedule = options.schedule ?? ((_k, task) => task());
  const progress: Progress = options.progress ?? (async () => undefined);
  const online = tmdbConfigured();
  const summary: ImportSummary = { films: 0, episodes: 0, ratings: 0, saved: 0, already: 0, skipped: 0 };

  const [films, episodes, loose] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId }, select: { movieId: true } }),
    db.watchedEpisode.findMany({ where: { userId }, select: { showId: true, seasonNumber: true, episodeNumber: true } }),
    db.play.findMany({
      where: { userId, sourceRef: null, source: { in: ADOPTABLE } },
      select: { mediaType: true, tmdbId: true, seasonNumber: true, episodeNumber: true },
    }),
  ]);
  const key = (m: string, id: number, s?: number | null, e?: number | null) => (m === "movie" ? `movie-${id}` : `tv-${id}-${s}-${e}`);
  const seen = new Set([...films.map((f) => key("movie", f.movieId)), ...episodes.map((e) => key("tv", e.showId, e.seasonNumber, e.episodeNumber))]);
  const adoptable = new Set(loose.map((p) => key(p.mediaType, p.tmdbId, p.seasonNumber, p.episodeNumber)));
  /** Worth sending to `recordPlay`: new, or known only by a play it can adopt. */
  const worth = (k: string) => !seen.has(k) || adoptable.has(k);

  // TMDB details once per title, through the queue, so a large import shares
  // the gate with everything else and a title the job already holds is a row.
  const movieDetails = (id: number) =>
    online ? schedule(`details:movie:${id}`, () => getMovieDetails(id).catch(() => null)) : Promise.resolve<MovieDetails | null>(null);
  const tvDetails = (id: number) =>
    online ? schedule(`details:tv:${id}`, () => getTvDetails(id).catch(() => null)) : Promise.resolve<TvDetails | null>(null);

  // ---- Films
  const movies = bundle.movies.filter((m) => m.movie.ids?.tmdb).slice(0, IMPORT_CAPS.movies);
  summary.skipped += bundle.movies.length - movies.length;
  const filmPlays: PlayInput[] = [];
  await progress("Matching films", movies.length, 0);
  let matched = 0;
  await mapLimit(movies, 4, async (m) => {
    const id = m.movie.ids!.tmdb!;
    const when = iso(m.last_watched_at);
    if (!when) {
      summary.skipped += 1;
    } else if (!worth(key("movie", id))) {
      summary.already += 1;
    } else {
      const d = await movieDetails(id);
      filmPlays.push({
        mediaType: "movie",
        tmdbId: id,
        title: d?.title ?? m.movie.title ?? "Untitled",
        poster: d?.poster_path ?? null,
        runtime: filmLength(d) ?? 0,
        score: d ? Math.round(d.vote_average * 10) : null,
        watchedAt: when,
        source: "trakt",
        sourceRef: `movie:${id}:${when.toISOString()}`,
      });
    }
    matched += 1;
    if (matched % 10 === 0) await progress("Matching films", movies.length, matched);
  });

  // ---- Episodes
  const shows = bundle.shows.filter((s) => s.show.ids?.tmdb).slice(0, IMPORT_CAPS.shows);
  summary.skipped += bundle.shows.length - shows.length;
  const episodePlays: PlayInput[] = [];
  await progress("Matching shows", shows.length, 0);
  matched = 0;
  await mapLimit(shows, 4, async (s) => {
    const id = s.show.ids!.tmdb!;
    const fresh = s.seasons.flatMap((season) =>
      // Specials sit outside the numbered run and are not tracked here.
      season.number === 0 ? [] : season.episodes.map((e) => ({ season: season.number, episode: e.number, when: iso(e.last_watched_at) ?? iso(s.last_watched_at) })),
    );
    const wanted = fresh.filter((e) => {
      if (!e.when) {
        summary.skipped += 1;
        return false;
      }
      if (worth(key("tv", id, e.season, e.episode))) return true;
      summary.already += 1;
      return false;
    });
    if (wanted.length) {
      const d = await tvDetails(id);
      for (const e of wanted) {
        episodePlays.push({
          mediaType: "tv",
          tmdbId: id,
          title: d?.name ?? s.show.title ?? "Untitled",
          poster: d?.poster_path ?? null,
          seasonNumber: e.season,
          episodeNumber: e.episode,
          // Trakt's watched list carries no episode names; the season list shows TMDB's.
          episodeName: `Episode ${e.episode}`,
          runtime: episodeLength(d) ?? 42,
          watchedAt: e.when!,
          source: "trakt",
          sourceRef: `episode:${id}:${e.season}:${e.episode}:${e.when!.toISOString()}`,
        });
      }
    }
    matched += 1;
    if (matched % 5 === 0) await progress("Matching shows", shows.length, matched);
  });

  // ---- Plays, oldest first, so the earliest viewing becomes the first.
  const plays = [...filmPlays, ...episodePlays].sort((a, b) => a.watchedAt!.getTime() - b.watchedAt!.getTime());
  await progress("Logging what you watched", plays.length, 0);
  let logged = 0;
  for (const play of plays) {
    const result = await recordPlay(userId, play);
    // Watched now, whatever it was before: the watchlist below leaves it off.
    seen.add(key(play.mediaType, play.tmdbId, play.seasonNumber, play.episodeNumber));
    if (result.created) {
      if (play.mediaType === "movie") summary.films += 1;
      else summary.episodes += 1;
    } else summary.already += 1;
    logged += 1;
    if (logged % 25 === 0) await progress("Logging what you watched", plays.length, logged);
  }

  // ---- Ratings: Trakt's 1 to 10 is a percentage in tens, into popcorn by the migration's rule.
  await progress("Ratings and watchlist", bundle.ratings.length + bundle.watchlist.length, 0);
  for (const r of bundle.ratings) {
    const target = r.type === "movie" ? r.movie : r.show;
    const id = target?.ids?.tmdb;
    const mediaType = r.type === "movie" ? "movie" : "tv";
    if (!id || typeof r.rating !== "number" || r.rating < 1 || r.rating > 10) {
      summary.skipped += 1;
      continue;
    }
    const where = { userId_mediaType_tmdbId: { userId, mediaType, tmdbId: id } };
    if (await db.rating.findUnique({ where, select: { id: true } })) {
      summary.already += 1;
      continue;
    }
    const d = mediaType === "movie" ? await movieDetails(id) : await tvDetails(id);
    await db.rating.create({
      data: {
        userId,
        mediaType,
        tmdbId: id,
        title: (d && ("title" in d ? d.title : d.name)) ?? target?.title ?? "Untitled",
        poster: d?.poster_path ?? null,
        score: popcornFromPercent(r.rating * 10),
        legacyScore: r.rating * 10,
      },
    });
    summary.ratings += 1;
  }

  // ---- The watchlist: added where it is not already, and never a film already seen.
  for (const w of bundle.watchlist) {
    const target = w.type === "movie" ? w.movie : w.show;
    const id = target?.ids?.tmdb;
    const mediaType = w.type === "movie" ? "movie" : "tv";
    if (!id) {
      summary.skipped += 1;
      continue;
    }
    if (mediaType === "movie" && seen.has(key("movie", id))) {
      summary.already += 1;
      continue;
    }
    const where = { userId_mediaType_tmdbId: { userId, mediaType, tmdbId: id } };
    if (await db.watchlistItem.findUnique({ where, select: { id: true } })) {
      summary.already += 1;
      continue;
    }
    const d = mediaType === "movie" ? await movieDetails(id) : await tvDetails(id);
    await db.watchlistItem.create({
      data: {
        userId,
        mediaType,
        tmdbId: id,
        title: (d && ("title" in d ? d.title : d.name)) ?? target?.title ?? "Untitled",
        poster: d?.poster_path ?? null,
        score: d ? Math.round(d.vote_average * 10) : null,
        addedAt: iso(w.listed_at) ?? new Date(),
      },
    });
    summary.saved += 1;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Running one

export type ImportProgress = {
  running: boolean;
  source: string | null;
  stage: string | null;
  total: number;
  done: number;
  finishedAt: string | null;
  summary: (ImportSummary & { error?: string }) | null;
};

const g = globalThis as unknown as { trekkerImports?: Map<string, Promise<void>> };
const running = (g.trekkerImports ??= new Map<string, Promise<void>>());

/** What Home's card and the Trakt sheet read. An import cut off by a restart reads as not running. */
export async function importProgress(userId: string): Promise<ImportProgress> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { importSource: true, importStage: true, importTotal: true, importDone: true, importStartedAt: true, importFinishedAt: true, importSummary: true },
  });
  let summary: ImportProgress["summary"] = null;
  try {
    summary = u?.importSummary ? JSON.parse(u.importSummary) : null;
  } catch {
    summary = null;
  }
  return {
    running: running.has(userId),
    source: u?.importSource ?? null,
    stage: u?.importStage ?? null,
    total: u?.importTotal ?? 0,
    done: u?.importDone ?? 0,
    finishedAt: u?.importFinishedAt?.toISOString() ?? null,
    summary,
  };
}

/**
 * Starts an import behind the request and returns at once; a second press
 * while one runs is the same run. `load` fetches or parses the bundle, inside
 * the run, so a slow Trakt is progress on the card rather than a spinning
 * button. Ends by starting the backfill, whose last act is the badge pass.
 */
export function startImport(userId: string, source: "trakt" | "trakt-file", load: () => Promise<TraktBundle>): Promise<void> {
  const already = running.get(userId);
  if (already) return already;

  const job = (async () => {
    const stamp = (data: Record<string, unknown>) => db.user.update({ where: { id: userId }, data });
    await stamp({
      importSource: source,
      importStage: "Reading your history",
      importTotal: 0,
      importDone: 0,
      importStartedAt: new Date(),
      importFinishedAt: null,
      importSummary: null,
    });
    try {
      const bundle = await load();
      const summary = await importBundle(userId, bundle, {
        schedule: (key, task) => queue.enqueue(key, task),
        progress: async (stage, total, done) => {
          await stamp({ importStage: stage, importTotal: total, importDone: done });
        },
      });
      await stamp({ importStage: null, importFinishedAt: new Date(), importSummary: JSON.stringify(summary) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The import stopped";
      await stamp({ importStage: null, importFinishedAt: new Date(), importSummary: JSON.stringify({ error: message }) });
      return;
    }
    // Where the person is in each show, then the badges: the backfill does both.
    await stamp({ backfillFinishedAt: null });
    await startBackfill(userId);
  })()
    .catch((error) => console.error(`import for ${userId} failed`, error))
    .finally(() => running.delete(userId));

  running.set(userId, job);
  return job;
}
