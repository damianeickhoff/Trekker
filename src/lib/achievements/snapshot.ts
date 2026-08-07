import "server-only";
import { mapLimit } from "../concurrency";
import { db } from "../db";
import { getShowCompletion } from "../continue-watching";
import { getCollection, getTitleFacts, tmdbConfigured, type MediaType } from "../tmdb";

/** How many titles are looked up on TMDB in one pass over the achievements. */
const LOOKUP_BUDGET = 80;
/** How many franchises are resolved in one pass. */
const COLLECTION_BUDGET = 25;
/** Parallel TMDB requests. Matches the fan-out used for "up next". */
const FANOUT = 6;
/** Facts do not change after release, but franchises gain entries. */
const STALE_AFTER_DAYS = 90;

export type Facts = {
  title: string;
  genres: string[];
  originalLanguage: string | null;
  /** Release year, or null when TMDB has no date. */
  year: number | null;
  runtime: number | null;
  collectionId: number | null;
  collectionName: string | null;
};

export type WatchedMovieRow = {
  tmdbId: number;
  title: string;
  poster: string | null;
  runtime: number;
  /** TMDB audience score, 0-100, when it was captured. */
  score: number | null;
  watchedAt: Date;
  facts: Facts | null;
};

export type WatchedEpisodeRow = {
  showId: number;
  showName: string;
  showPoster: string | null;
  runtime: number;
  watchedAt: Date;
};

/** One viewing, for the achievements that are about volume rather than variety. */
export type PlayRow = {
  mediaType: string;
  tmdbId: number;
  /** Film title, or show name. Carried so an achievement can name its evidence. */
  title: string;
  poster: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  runtime: number;
  watchedAt: Date;
};

export type RatingRow = {
  mediaType: string;
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number;
  review: string | null;
};

/** One calendar day with something logged on it. */
export type DayBucket = {
  date: Date;
  minutes: number;
  items: number;
  movies: number;
  /** Episodes watched that day, per show — the binge measure. */
  episodesPerShow: Map<number, number>;
};

export type Franchise = {
  id: number;
  name: string;
  owned: number;
  total: number;
};

export type Snapshot = {
  now: Date;
  /**
   * Distinct titles. A collection badge — a hundred films, twelve genres,
   * thirteen horror films in one October — must count different things, or
   * watching one film thirteen times would earn it.
   */
  movies: WatchedMovieRow[];
  episodes: WatchedEpisodeRow[];
  /**
   * Every viewing. A habit badge counts these instead: a streak measures how
   * often someone sat down to watch something, and a week of comfort rewatches
   * is still a week of watching something every night. Ten episodes of one show
   * in a day is, if anything, *most* naturally a rewatch.
   */
  plays: PlayRow[];
  /** Viewings, split by kind — for badges that are a volume claim. */
  playCounts: { movies: number; episodes: number };
  /** Everything rated, with enough to name it in a list. */
  ratingRows: RatingRow[];
  watchlist: { mediaType: string; tmdbId: number; title: string; poster: string | null }[];
  friends: { id: string; name: string }[];
  /** Facts per show the user has watched, keyed by TMDB show id. */
  showFacts: Map<number, Facts>;
  ratings: { score: number; review: string | null }[];
  watchlistCount: number;
  friendCount: number;
  totalMinutes: number;
  /** Every day with something on it, oldest first. */
  days: DayBucket[];
  /** Shows watched to the end of a finished run. Empty without a TMDB key. */
  finishedShows: number;
  /**
   * Show id → "completed" | "up-to-date" | "continue". Empty on the offline
   * pass, which cannot afford to ask TMDB what "finished" means.
   */
  showStates: Map<number, string>;
  /** Franchises the user has at least two films from, most complete first. */
  franchises: Franchise[];
  /** True when some titles are still waiting for their first TMDB lookup. */
  pendingLookups: number;
};

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function toFacts(row: {
  title: string;
  genres: string;
  originalLanguage: string | null;
  releaseDate: string | null;
  runtime: number | null;
  collectionId: number | null;
  collectionName: string | null;
}): Facts {
  const year = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : NaN;
  return {
    title: row.title,
    genres: row.genres ? row.genres.split(",").filter(Boolean) : [],
    originalLanguage: row.originalLanguage,
    year: Number.isFinite(year) ? year : null,
    runtime: row.runtime,
    collectionId: row.collectionId,
    collectionName: row.collectionName,
  };
}

/**
 * Fills the shared title cache for anything the user has watched that is not in
 * it yet, a bounded number at a time. A first visit with a long history will
 * not resolve everything at once — the genre and franchise achievements simply
 * read low until later visits finish the job, which is honest and cheap.
 */
async function enrichTitles(
  wanted: { mediaType: MediaType; tmdbId: number }[],
  offline = false,
): Promise<{ cache: Map<string, Facts>; pending: number }> {
  const cache = new Map<string, Facts>();
  if (wanted.length === 0) return { cache, pending: 0 };

  // Two `in` lists rather than one `OR` per title: a long history would other-
  // wise build a WHERE clause with thousands of branches in it.
  const existing = await db.titleMeta.findMany({
    where: {
      OR: [
        {
          mediaType: "movie",
          tmdbId: { in: wanted.filter((w) => w.mediaType === "movie").map((w) => w.tmdbId) },
        },
        {
          mediaType: "tv",
          tmdbId: { in: wanted.filter((w) => w.mediaType === "tv").map((w) => w.tmdbId) },
        },
      ],
    },
  });

  const staleBefore = Date.now() - STALE_AFTER_DAYS * 86_400_000;
  const known = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    known.set(`${row.mediaType}-${row.tmdbId}`, row);
    cache.set(`${row.mediaType}-${row.tmdbId}`, toFacts(row));
  }

  // Offline: whatever the shared cache already knows, and not a single request.
  // The achievements that lean on these facts simply read low, which is the same
  // thing that happens on a cold cache anyway.
  if (offline || !tmdbConfigured()) {
    return { cache, pending: wanted.length - existing.length };
  }

  // Never looked up beats gone stale: a missing row contributes nothing at all.
  const missing = wanted.filter((w) => !known.has(`${w.mediaType}-${w.tmdbId}`));
  const stale = wanted.filter((w) => {
    const row = known.get(`${w.mediaType}-${w.tmdbId}`);
    return row !== undefined && row.fetchedAt.getTime() < staleBefore;
  });

  const queue = [...missing, ...stale].slice(0, LOOKUP_BUDGET);

  await mapLimit(queue, FANOUT, async (item) => {
    const facts = await getTitleFacts(item.mediaType, item.tmdbId).catch(() => null);
    if (!facts) return;

    const data = {
      title: facts.title,
      genres: facts.genres.join(","),
      originalLanguage: facts.originalLanguage,
      releaseDate: facts.releaseDate,
      runtime: facts.runtime,
      collectionId: facts.collection?.id ?? null,
      collectionName: facts.collection?.name ?? null,
      fetchedAt: new Date(),
    };

    await db.titleMeta
      .upsert({
        where: { mediaType_tmdbId: { mediaType: item.mediaType, tmdbId: item.tmdbId } },
        create: { mediaType: item.mediaType, tmdbId: item.tmdbId, ...data },
        update: data,
      })
      .catch(() => undefined);

    cache.set(`${item.mediaType}-${item.tmdbId}`, toFacts({ ...data, title: facts.title }));
  });

  return { cache, pending: Math.max(0, missing.length - queue.length) };
}

/**
 * How complete each of the user's franchises is.
 *
 * Only collections they own at least two films from are resolved: one film out
 * of a series can never be a completed franchise, and this keeps the number of
 * collection lookups proportional to what is actually close to finished.
 */
async function resolveFranchises(movies: WatchedMovieRow[]): Promise<Franchise[]> {
  if (!tmdbConfigured()) return [];

  const owned = new Map<number, { name: string; ids: Set<number> }>();
  for (const movie of movies) {
    const id = movie.facts?.collectionId;
    if (!id) continue;
    const entry = owned.get(id) ?? { name: movie.facts?.collectionName ?? "Franchise", ids: new Set<number>() };
    entry.ids.add(movie.tmdbId);
    owned.set(id, entry);
  }

  const candidates = [...owned.entries()]
    .filter(([, entry]) => entry.ids.size >= 2)
    .sort((a, b) => b[1].ids.size - a[1].ids.size)
    .slice(0, COLLECTION_BUDGET);

  const resolved = await mapLimit(candidates, FANOUT, async ([id, entry]) => {
    const collection = await getCollection(id).catch(() => null);
    if (!collection || collection.parts.length === 0) return null;

    // Count against the films TMDB lists, not against what the user has: an
    // entry they logged that the collection has since dropped should not push
    // a franchise past 100%.
    const partIds = new Set(collection.parts.map((p) => p.id));
    const seen = [...entry.ids].filter((tmdbId) => partIds.has(tmdbId)).length;

    return {
      id,
      name: collection.name,
      owned: seen,
      total: collection.parts.length,
    } satisfies Franchise;
  });

  return resolved
    .filter((f): f is Franchise => f !== null)
    .sort((a, b) => b.owned / b.total - a.owned / a.total);
}

/**
 * @param offline Read the database and the shared title cache, and make no
 *   network requests at all. Used by the background unlock check, which runs
 *   often enough that a TMDB fan-out per started show would be indefensible.
 *   Everything it cannot see reads low, so it can only ever unlock a badge
 *   *later* than the full pass would — never wrongly.
 */
export async function buildSnapshot(
  userId: string,
  { offline = false }: { offline?: boolean } = {},
): Promise<Snapshot> {
  const [movieRows, episodeRows, playRows, ratingRows, watchlistRows, friendRows] = await Promise.all([
    db.watchedMovie.findMany({
      where: { userId },
      select: { movieId: true, title: true, poster: true, runtime: true, score: true, watchedAt: true },
    }),
    db.watchedEpisode.findMany({
      where: { userId },
      select: { showId: true, showName: true, showPoster: true, runtime: true, watchedAt: true },
    }),
    db.play.findMany({
      where: { userId },
      select: {
        mediaType: true,
        tmdbId: true,
        title: true,
        poster: true,
        seasonNumber: true,
        episodeNumber: true,
        runtime: true,
        watchedAt: true,
      },
    }),
    db.rating.findMany({
      where: { userId },
      select: { mediaType: true, tmdbId: true, title: true, poster: true, score: true, review: true },
    }),
    db.watchlistItem.findMany({
      where: { userId },
      select: { mediaType: true, tmdbId: true, title: true, poster: true },
      orderBy: { addedAt: "desc" },
    }),
    db.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: {
        requesterId: true,
        requester: { select: { id: true, name: true } },
        addressee: { select: { id: true, name: true } },
      },
    }),
  ]);

  const showIds = [...new Set(episodeRows.map((e) => e.showId))];
  const movieIds = [...new Set(movieRows.map((m) => m.movieId))];

  const [{ cache, pending }, completion] = await Promise.all([
    enrichTitles(
      [
        ...movieIds.map((id) => ({ mediaType: "movie" as const, tmdbId: id })),
        ...showIds.map((id) => ({ mediaType: "tv" as const, tmdbId: id })),
      ],
      offline,
    ),
    // Needs TMDB to know what "finished" even means; fails soft to "none", and
    // offline it is not asked at all — it is one lookup per started show, which
    // is the single most expensive thing in here.
    offline
      ? Promise.resolve(new Map<number, string>())
      : getShowCompletion(userId).catch(() => new Map<number, string>()),
  ]);

  const movies: WatchedMovieRow[] = movieRows.map((m) => ({
    tmdbId: m.movieId,
    title: m.title,
    poster: m.poster,
    runtime: m.runtime,
    score: m.score,
    watchedAt: m.watchedAt,
    facts: cache.get(`movie-${m.movieId}`) ?? null,
  }));

  const episodes: WatchedEpisodeRow[] = episodeRows.map((e) => ({
    showId: e.showId,
    showName: e.showName,
    showPoster: e.showPoster,
    runtime: e.runtime,
    watchedAt: e.watchedAt,
  }));

  const showFacts = new Map<number, Facts>();
  for (const id of showIds) {
    const facts = cache.get(`tv-${id}`);
    if (facts) showFacts.set(id, facts);
  }

  // One bucket per calendar day, in local time — "what did I watch on Saturday"
  // is a question about the viewer's calendar, not about UTC.
  const perDay = new Map<string, DayBucket>();
  function bucket(at: Date) {
    const key = dayKey(at);
    const existing = perDay.get(key);
    if (existing) return existing;
    const fresh: DayBucket = {
      date: at,
      minutes: 0,
      items: 0,
      movies: 0,
      episodesPerShow: new Map(),
    };
    perDay.set(key, fresh);
    return fresh;
  }

  // Filled from the play log, not from the title lists: "was I watching
  // something that day" is a question about occasions, and a rewatch is an
  // occasion.
  for (const play of playRows) {
    const day = bucket(play.watchedAt);
    day.minutes += play.runtime;
    day.items += 1;

    if (play.mediaType === "movie") {
      day.movies += 1;
    } else {
      day.episodesPerShow.set(play.tmdbId, (day.episodesPerShow.get(play.tmdbId) ?? 0) + 1);
    }
  }

  const days = [...perDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    now: new Date(),
    movies,
    episodes,
    plays: playRows,
    playCounts: {
      movies: playRows.filter((p) => p.mediaType === "movie").length,
      episodes: playRows.filter((p) => p.mediaType === "tv").length,
    },
    showFacts,
    ratings: ratingRows.map((row) => ({ score: row.score, review: row.review })),
    ratingRows,
    watchlist: watchlistRows,
    watchlistCount: watchlistRows.length,
    friends: friendRows.map((row) =>
      // Whichever end of the pair is not the viewer.
      row.requesterId === userId ? row.addressee : row.requester,
    ),
    friendCount: friendRows.length,
    totalMinutes: days.reduce((sum, d) => sum + d.minutes, 0),
    days,
    finishedShows: [...completion.values()].filter((state) => state === "completed").length,
    showStates: completion,
    franchises: offline ? [] : await resolveFranchises(movies),
    pendingLookups: pending,
  };
}
