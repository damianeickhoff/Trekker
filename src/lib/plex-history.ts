import "server-only";
import { revalidatePath } from "next/cache";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import {
  findPlexAccountId,
  getPlexConnection,
  getPlexHistory,
  getPlexTmdbId,
  getPlexWatchedLibrary,
} from "./plex";
import { recordPlay } from "./plays";
import { getMovie, getTv, searchMulti, tmdbConfigured } from "./tmdb";

/**
 * Pulls what you have finished on Plex into Trekker.
 *
 * Plex writes a history entry only once it considers something watched, so this
 * is a watch log rather than a progress feed — exactly what we want. Matching
 * runs on the TMDB id the library item is tagged with, falling back to a title
 * search when there is none; anything still unmatched is named in the summary
 * rather than silently dropped.
 */

export type PlexHistoryState = {
  error?: string;
  summary?: {
    movies: number;
    episodes: number;
    already: number;
    skipped: number;
    /** A few of the titles that could not be matched, so a skip is explicable. */
    unmatched: string[];
  };
};

const FANOUT = 5;
/** How far back to look. Plex keeps history forever; nobody needs all of it. */
const LIMIT = 500;

/**
 * Last resort when the library item carries no TMDB guid — a library on the
 * legacy agents, or a personal item that was never matched. Title and year are
 * weaker evidence than an id, so this insists on the right medium and, for a
 * film, a year within one either way.
 */
async function searchTmdbId(subject: {
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
}): Promise<number | null> {
  if (!subject.title || subject.title === "Untitled") return null;

  const results = await searchMulti(subject.title).catch(() => []);
  const candidates = results.filter((r) => r.mediaType === subject.mediaType);
  if (candidates.length === 0) return null;

  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const exact = candidates.filter((r) => clean(r.title) === clean(subject.title));
  const pool = exact.length > 0 ? exact : candidates;

  if (subject.year !== null) {
    const dated = pool.find(
      (r) => r.year && Math.abs(Number(r.year) - subject.year!) <= 1,
    );
    if (dated) return dated.id;
    // A year that matches nothing is a sign this is the wrong title.
    return exact.length > 0 ? exact[0].id : null;
  }

  return exact.length > 0 ? exact[0].id : null;
}

export async function syncPlexHistory(userId: string): Promise<PlexHistoryState> {
  const user = { id: userId };
  if (!tmdbConfigured()) return { error: "TMDB_API_KEY is not set on the server" };

  // As the viewer, not as the admin: watched state is per Plex account.
  const connection = await getPlexConnection(user.id);
  if (!connection) return { error: "No Plex server is connected" };

  const identity = await db.user.findUnique({
    where: { id: user.id },
    select: { plexAccountId: true, plexUsername: true },
  });

  if (!identity?.plexAccountId && !identity?.plexUsername) {
    return { error: "Link your Plex account first, so we know which viewing is yours" };
  }

  const accountId = await findPlexAccountId(connection, {
    accountId: identity.plexAccountId,
    username: identity.plexUsername,
  });

  // Two sources, because neither is complete on its own. The library carries
  // everything currently flagged as watched — including things marked without
  // ever being played, which write no history row. History carries the dates,
  // and covers items since removed from the library.
  const [library, played] = await Promise.all([
    getPlexWatchedLibrary(connection).catch(() => []),
    accountId
      ? getPlexHistory(connection, accountId, LIMIT).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Anything the library says is watched wins over anything history remembers:
  // history is a record of plays that happened, and un-marking something on
  // Plex does not erase them. Without this, un-watching on Plex and re-syncing
  // put the row straight back.
  const stillWatched = new Set<string>();
  for (const entry of library) {
    const key =
      entry.type === "episode"
        ? `e:${entry.grandparentRatingKey}:${entry.seasonNumber}:${entry.episodeNumber}`
        : `m:${entry.ratingKey}`;
    stillWatched.add(key);
  }

  const inLibrary = new Set(
    library.map((entry) =>
      entry.type === "episode" ? entry.grandparentRatingKey : entry.ratingKey,
    ),
  );

  const playedButNotWatched = played.filter((entry) => {
    const owner = entry.type === "episode" ? entry.grandparentRatingKey : entry.ratingKey;
    // Not in the library at all — removed since, or never there. History is the
    // only record we have, so keep it.
    if (!owner || !inLibrary.has(owner)) return true;

    const key =
      entry.type === "episode"
        ? `e:${entry.grandparentRatingKey}:${entry.seasonNumber}:${entry.episodeNumber}`
        : `m:${entry.ratingKey}`;

    return stillWatched.has(key);
  });

  // Where each row came from decides what it can say. A history row is an event
  // — one per `viewedAt`, so three viewings are three rows, which is what makes
  // it the only real source of rewatches here. A library row is *state*: it says
  // "watched", not "watched on these occasions", so it can only ever stand for a
  // single play.
  const history = [
    ...playedButNotWatched.map((entry) => ({ entry, origin: "history" as const })),
    ...library.map((entry) => ({ entry, origin: "library" as const })),
  ];

  if (history.length === 0) {
    return accountId
      ? { summary: { movies: 0, episodes: 0, already: 0, skipped: 0, unmatched: [] } }
      : { error: "That Plex account has no viewing on this server" };
  }

  // ---- Resolve library items to TMDB ids ------------------------------------
  // One lookup per distinct title, not per play: a show watched through is one
  // key, and a film rewatched three times is one call.
  type Subject = {
    key: string;
    mediaType: "movie" | "tv";
    title: string;
    year: number | null;
  };

  const subjects = new Map<string, Subject>();

  for (const { entry } of history) {
    const isEpisode = entry.type === "episode";
    const key = isEpisode ? entry.grandparentRatingKey : entry.ratingKey;
    if (!key || subjects.has(key)) continue;

    subjects.set(key, {
      key,
      mediaType: isEpisode ? "tv" : "movie",
      title: (isEpisode ? entry.showTitle : entry.title) ?? entry.title,
      year: isEpisode ? null : entry.year,
    });
  }

  const resolved = new Map<string, number | null>();
  const pairs = await mapLimit([...subjects.values()], FANOUT, async (subject) => ({
    key: subject.key,
    tmdbId:
      (await getPlexTmdbId(connection, subject.key).catch(() => null)) ??
      (await searchTmdbId(subject).catch(() => null)),
  }));
  for (const { key, tmdbId } of pairs) resolved.set(key, tmdbId);

  // Named in the summary: "141 skipped" says nothing, "141 skipped — Dead City,
  // …" says which library items are not matched to anything.
  const unmatched = [...subjects.values()]
    .filter((subject) => !resolved.get(subject.key))
    .map((subject) => subject.title)
    .slice(0, 5);

  let skipped = 0;
  let already = 0;

  // What is already on record. A library row that matches one of these is saying
  // nothing new — it reports state, and the state is already known — so it is
  // dropped here rather than turned into a play. That keeps a first sync of a
  // five-thousand-item library from walking the log a row at a time, and leaves
  // history rows as the only thing that can add a viewing to something already
  // watched, which is exactly right: they are the only per-play source.
  const [existingMovies, existingEpisodes] = await Promise.all([
    db.watchedMovie
      .findMany({ where: { userId: user.id }, select: { movieId: true } })
      .then((rows) => new Set(rows.map((m) => m.movieId))),
    db.watchedEpisode
      .findMany({
        where: { userId: user.id },
        select: { showId: true, seasonNumber: true, episodeNumber: true },
      })
      .then((rows) => new Set(rows.map((e) => `${e.showId}-${e.seasonNumber}-${e.episodeNumber}`))),
  ]);

  type MoviePlay = { tmdbId: number; watchedAt: Date; sourceRef: string | null };
  type EpisodePlay = {
    showId: number;
    seasonNumber: number;
    episodeNumber: number;
    episodeName: string;
    watchedAt: Date;
    sourceRef: string | null;
  };

  const moviePlays: MoviePlay[] = [];
  const episodePlays: EpisodePlay[] = [];

  for (const { entry, origin } of history) {
    // A history row identifies its own viewing: the item plus the second it was
    // played. That is what makes re-running this sync free — every row it has
    // already logged collides on `sourceRef` and is skipped. A library row has
    // no such id, and gets null.
    const sourceRef =
      origin === "history" && entry.ratingKey
        ? `${entry.ratingKey}:${Math.floor(entry.watchedAt.getTime() / 1000)}`
        : null;

    if (entry.type === "movie") {
      const tmdbId = entry.ratingKey ? resolved.get(entry.ratingKey) : null;
      if (!tmdbId) {
        skipped += 1;
        continue;
      }
      if (origin === "library" && existingMovies.has(tmdbId)) {
        already += 1;
        continue;
      }
      moviePlays.push({ tmdbId, watchedAt: entry.watchedAt, sourceRef });
      continue;
    }

    if (entry.seasonNumber === null || entry.episodeNumber === null) {
      skipped += 1;
      continue;
    }
    // Specials sit outside the numbered run and are not tracked here.
    if (entry.seasonNumber === 0) continue;

    const showId = entry.grandparentRatingKey ? resolved.get(entry.grandparentRatingKey) : null;
    if (!showId) {
      skipped += 1;
      continue;
    }

    const key = `${showId}-${entry.seasonNumber}-${entry.episodeNumber}`;
    if (origin === "library" && existingEpisodes.has(key)) {
      already += 1;
      continue;
    }

    episodePlays.push({
      showId,
      seasonNumber: entry.seasonNumber,
      episodeNumber: entry.episodeNumber,
      episodeName: entry.title,
      watchedAt: entry.watchedAt,
      sourceRef,
    });
  }

  // One TMDB call per distinct title, not per play: a film seen three times is
  // one lookup, and a show watched through is one.
  const movieIds = [...new Set(moviePlays.map((p) => p.tmdbId))];
  const movies = new Map(
    (
      await mapLimit(movieIds, FANOUT, async (tmdbId) => ({
        tmdbId,
        detail: await getMovie(tmdbId).catch(() => null),
      }))
    ).map(({ tmdbId, detail }) => [tmdbId, detail]),
  );

  const showIds = [...new Set(episodePlays.map((p) => p.showId))];
  const shows = new Map(
    (
      await mapLimit(showIds, FANOUT, async (showId) => ({
        showId,
        detail: await getTv(showId).catch(() => null),
      }))
    ).map(({ showId, detail }) => [showId, detail]),
  );

  // Oldest first, so the earliest viewing is the one that becomes "first seen".
  moviePlays.sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());
  episodePlays.sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());

  let movieCount = 0;
  for (const play of moviePlays) {
    const detail = movies.get(play.tmdbId);
    if (!detail) {
      skipped += 1;
      continue;
    }

    const result = await recordPlay(user.id, {
      mediaType: "movie",
      tmdbId: detail.id,
      title: detail.title,
      poster: detail.poster_path,
      runtime: detail.runtime ?? 0,
      score: Math.round(detail.vote_average * 10),
      watchedAt: play.watchedAt,
      source: "plex",
      sourceRef: play.sourceRef,
    });

    if (result.created) movieCount += 1;
    else already += 1;
  }

  let episodeCount = 0;
  for (const play of episodePlays) {
    const detail = shows.get(play.showId);
    if (!detail) {
      skipped += 1;
      continue;
    }

    const result = await recordPlay(user.id, {
      mediaType: "tv",
      tmdbId: detail.id,
      title: detail.name,
      poster: detail.poster_path,
      seasonNumber: play.seasonNumber,
      episodeNumber: play.episodeNumber,
      episodeName: play.episodeName,
      runtime: detail.episode_run_time?.[0] ?? 42,
      watchedAt: play.watchedAt,
      source: "plex",
      sourceRef: play.sourceRef,
    });

    if (result.created) episodeCount += 1;
    else already += 1;
  }

  revalidatePath("/", "layout");
  return {
    summary: {
      movies: movieCount,
      episodes: episodeCount,
      already,
      skipped,
      unmatched,
    },
  };
}
