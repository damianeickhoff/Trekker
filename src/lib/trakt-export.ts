import "server-only";
import type { TraktMovie, TraktShow } from "./trakt";
import { readZip, ZipError } from "./zip";

/**
 * Reads a Trakt data export.
 *
 * Trakt's API needs a VIP client id, but every account can request a full data
 * export from their settings — a zip of JSON files. The shapes inside mirror
 * the API responses, so once they are picked out of the archive the rest of the
 * import is exactly the same code path.
 *
 * The archive's file names have changed over the years and differ between the
 * GDPR export and the VIP one, so nothing here matches on names: it parses
 * every JSON member and recognises the payloads by shape. Watched lists are
 * preferred; where they are absent, the play history is folded into the same
 * structure.
 */

export class TraktExportError extends Error {}

export type ExportedHistory = { movies: TraktMovie[]; shows: TraktShow[] };

type Unknown = Record<string, unknown>;

function isObject(value: unknown): value is Unknown {
  return typeof value === "object" && value !== null;
}

function tmdbId(ids: unknown): number | null {
  if (!isObject(ids)) return null;
  const value = ids.tmdb;
  return typeof value === "number" ? value : null;
}

export function parseTraktExport(file: Buffer, filename: string): ExportedHistory {
  const documents: unknown[] = [];

  if (filename.toLowerCase().endsWith(".json")) {
    documents.push(parseJson(file, filename));
  } else {
    let entries;
    try {
      entries = readZip(file);
    } catch (error) {
      throw new TraktExportError(
        error instanceof ZipError ? error.message : "Could not read that archive",
      );
    }

    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith(".json")) continue;
      // A single unreadable member should not sink the whole import.
      try {
        documents.push(parseJson(entry.data, entry.name));
      } catch {
        continue;
      }
    }
  }

  const movies = new Map<number, TraktMovie>();
  const shows = new Map<number, TraktShow>();
  const historic: unknown[] = [];

  for (const document of documents) {
    if (!Array.isArray(document)) continue;

    for (const row of document) {
      if (!isObject(row)) continue;

      const movie = readWatchedMovie(row);
      if (movie) {
        keepLatestMovie(movies, movie);
        continue;
      }

      const show = readWatchedShow(row);
      if (show) {
        mergeShow(shows, show);
        continue;
      }

      // Not a watched row — might be a history event, decided afterwards.
      if (row.watched_at !== undefined) historic.push(row);
    }
  }

  // Only fall back to the play history for whichever half is missing: it is
  // one row per play, so rebuilding from it is lossier than the watched lists.
  if (movies.size === 0 || shows.size === 0) {
    foldHistory(historic, movies.size === 0 ? movies : null, shows.size === 0 ? shows : null);
  }

  if (movies.size === 0 && shows.size === 0) {
    throw new TraktExportError(
      "No watch history found in that file. Upload the zip Trakt emails you, without unpacking it.",
    );
  }

  return { movies: [...movies.values()], shows: [...shows.values()] };
}

function parseJson(data: Buffer, name: string): unknown {
  try {
    // Exports are UTF-8 and occasionally carry a byte-order mark.
    return JSON.parse(data.toString("utf8").replace(/^﻿/, ""));
  } catch {
    throw new TraktExportError(`${name} is not valid JSON`);
  }
}

/** `{ plays, last_watched_at, movie: { title, year, ids } }` */
function readWatchedMovie(row: Unknown): TraktMovie | null {
  if (!isObject(row.movie)) return null;
  if (row.plays === undefined && row.last_watched_at === undefined) return null;

  const movie = row.movie;
  const id = tmdbId(movie.ids);
  if (id === null) return null;

  const watchedAt = typeof row.last_watched_at === "string" ? row.last_watched_at : null;
  if (!watchedAt) return null;

  return {
    plays: typeof row.plays === "number" ? row.plays : 1,
    last_watched_at: watchedAt,
    movie: {
      title: typeof movie.title === "string" ? movie.title : "Untitled",
      year: typeof movie.year === "number" ? movie.year : null,
      ids: { trakt: 0, tmdb: id },
    },
  };
}

/** `{ last_watched_at, show: {...}, seasons: [{ number, episodes: [...] }] }` */
function readWatchedShow(row: Unknown): TraktShow | null {
  if (!isObject(row.show) || !Array.isArray(row.seasons)) return null;

  const show = row.show;
  const id = tmdbId(show.ids);
  if (id === null) return null;

  const seasons = row.seasons.flatMap((season) => {
    if (!isObject(season) || typeof season.number !== "number") return [];
    if (!Array.isArray(season.episodes)) return [];

    const episodes = season.episodes.flatMap((episode) => {
      if (!isObject(episode) || typeof episode.number !== "number") return [];
      return [
        {
          number: episode.number,
          plays: typeof episode.plays === "number" ? episode.plays : 1,
          last_watched_at:
            typeof episode.last_watched_at === "string" ? episode.last_watched_at : "",
        },
      ];
    });

    return episodes.length > 0 ? [{ number: season.number, episodes }] : [];
  });

  if (seasons.length === 0) return null;

  return {
    last_watched_at: typeof row.last_watched_at === "string" ? row.last_watched_at : "",
    show: {
      title: typeof show.title === "string" ? show.title : "Untitled",
      year: typeof show.year === "number" ? show.year : null,
      ids: { trakt: 0, tmdb: id },
    },
    seasons,
  };
}

/**
 * Play history: one row per viewing, `{ watched_at, type, movie | show+episode }`.
 * Collapsed into the same watched shape, keeping the most recent play of each.
 */
function foldHistory(
  rows: unknown[],
  movies: Map<number, TraktMovie> | null,
  shows: Map<number, TraktShow> | null,
) {
  for (const row of rows) {
    if (!isObject(row) || typeof row.watched_at !== "string") continue;
    const watchedAt = row.watched_at;

    if (movies && isObject(row.movie) && !isObject(row.episode)) {
      const id = tmdbId(row.movie.ids);
      if (id === null) continue;

      keepLatestMovie(movies, {
        plays: 1,
        last_watched_at: watchedAt,
        movie: {
          title: typeof row.movie.title === "string" ? row.movie.title : "Untitled",
          year: typeof row.movie.year === "number" ? row.movie.year : null,
          ids: { trakt: 0, tmdb: id },
        },
      });
      continue;
    }

    if (shows && isObject(row.episode) && isObject(row.show)) {
      const id = tmdbId(row.show.ids);
      const season = row.episode.season;
      const number = row.episode.number;
      if (id === null || typeof season !== "number" || typeof number !== "number") continue;

      mergeShow(shows, {
        last_watched_at: watchedAt,
        show: {
          title: typeof row.show.title === "string" ? row.show.title : "Untitled",
          year: typeof row.show.year === "number" ? row.show.year : null,
          ids: { trakt: 0, tmdb: id },
        },
        seasons: [
          { number: season, episodes: [{ number, plays: 1, last_watched_at: watchedAt }] },
        ],
      });
    }
  }
}

function keepLatestMovie(movies: Map<number, TraktMovie>, movie: TraktMovie) {
  const id = movie.movie.ids.tmdb!;
  const existing = movies.get(id);
  if (!existing || existing.last_watched_at < movie.last_watched_at) movies.set(id, movie);
}

/** Union of seasons and episodes, keeping the newest timestamp per episode. */
function mergeShow(shows: Map<number, TraktShow>, incoming: TraktShow) {
  const id = incoming.show.ids.tmdb!;
  const existing = shows.get(id);

  if (!existing) {
    shows.set(id, incoming);
    return;
  }

  if (incoming.last_watched_at > existing.last_watched_at) {
    existing.last_watched_at = incoming.last_watched_at;
  }

  for (const season of incoming.seasons ?? []) {
    const target = existing.seasons?.find((s) => s.number === season.number);
    if (!target) {
      existing.seasons = [...(existing.seasons ?? []), season];
      continue;
    }

    for (const episode of season.episodes) {
      const seen = target.episodes.find((e) => e.number === episode.number);
      if (!seen) {
        target.episodes.push(episode);
      } else if (episode.last_watched_at > seen.last_watched_at) {
        seen.last_watched_at = episode.last_watched_at;
      }
    }
  }
}
