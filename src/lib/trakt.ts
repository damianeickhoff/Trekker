import "server-only";
import { readZip, ZipError } from "./zip";

/**
 * Trakt, as the current app reads it: two ways in to the same bundle.
 *
 * - Over the API, from the public profile endpoints, which need only a client
 *   id (the person's own, or `TRAKT_CLIENT_ID` for the instance) and no OAuth
 *   round trip, at the price of the profile being public.
 * - From the data export any account can ask Trakt for, uploaded as the zip
 *   they email. Its file names have changed over the years, so members are
 *   recognised by the shape of their rows, not their names; only the
 *   watchlist is told from a custom list by its file's name, since the two
 *   rows look alike.
 *
 * Import only: nothing is ever written back to Trakt.
 */

const BASE = "https://api.trakt.tv";

export class TraktError extends Error {}

type Ids = { tmdb?: number | null };
type Titled = { title?: string; year?: number | null; ids?: Ids };

export type TraktMovie = { last_watched_at: string; movie: Titled };
export type TraktShow = {
  last_watched_at: string;
  show: Titled;
  seasons: { number: number; episodes: { number: number; last_watched_at?: string | null }[] }[];
};
export type TraktRating = { rated_at: string; rating: number; type: "movie" | "show"; movie?: Titled; show?: Titled };
export type TraktListed = { listed_at: string; type: "movie" | "show"; movie?: Titled; show?: Titled };

export type TraktBundle = { movies: TraktMovie[]; shows: TraktShow[]; ratings: TraktRating[]; watchlist: TraktListed[] };

export function defaultTraktClientId(): string | null {
  return process.env.TRAKT_CLIENT_ID?.trim() || null;
}

async function trakt<T>(path: string, clientId: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new TraktError("Trakt could not be reached");
  }
  if (res.status === 404) throw new TraktError("No such Trakt user, or the profile is private");
  // Trakt answers 401 alike for a bad client id and a profile that is not public.
  if (res.status === 401 || res.status === 403) throw new TraktError("Trakt refused: check the client id, and that the profile is public");
  if (!res.ok) throw new TraktError(`Trakt answered ${res.status}`);
  return (await res.json()) as T;
}

/** A cheap check for the Link sheet: anything that resolves means the pair can import. */
export async function verifyTrakt(username: string, clientId: string) {
  await trakt(`/users/${encodeURIComponent(username)}`, clientId);
}

/**
 * Everything the import reads, from the public profile. Watched history is
 * required; ratings and the watchlist are welcome but a failure there leaves
 * them empty rather than failing the import.
 */
export async function fetchTraktBundle(username: string, clientId: string): Promise<TraktBundle> {
  const user = `/users/${encodeURIComponent(username)}`;
  const optional = <T>(path: string) => trakt<T[]>(user + path, clientId).catch(() => [] as T[]);
  const [movies, shows, ratedMovies, ratedShows, listedMovies, listedShows] = await Promise.all([
    trakt<TraktMovie[]>(`${user}/watched/movies`, clientId),
    trakt<TraktShow[]>(`${user}/watched/shows`, clientId),
    optional<TraktRating>("/ratings/movies"),
    optional<TraktRating>("/ratings/shows"),
    optional<TraktListed>("/watchlist/movies"),
    optional<TraktListed>("/watchlist/shows"),
  ]);
  return { movies, shows, ratings: [...ratedMovies, ...ratedShows], watchlist: [...listedMovies, ...listedShows] };
}

// ---------------------------------------------------------------------------
// The export

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const tmdbOf = (t: unknown) => (isRow(t) && isRow(t.ids) && typeof t.ids.tmdb === "number" ? t.ids.tmdb : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);

function titled(t: Row): Titled {
  return { title: str(t.title) ?? "Untitled", year: typeof t.year === "number" ? t.year : null, ids: { tmdb: tmdbOf(t) } };
}

function mergeShow(into: Map<number, TraktShow>, show: TraktShow) {
  const id = show.show.ids!.tmdb!;
  const have = into.get(id);
  if (!have) {
    into.set(id, show);
    return;
  }
  if (show.last_watched_at > have.last_watched_at) have.last_watched_at = show.last_watched_at;
  for (const season of show.seasons) {
    const target = have.seasons.find((s) => s.number === season.number);
    if (!target) {
      have.seasons.push(season);
      continue;
    }
    for (const ep of season.episodes) {
      const seen = target.episodes.find((e) => e.number === ep.number);
      if (!seen) target.episodes.push(ep);
      else if ((ep.last_watched_at ?? "") > (seen.last_watched_at ?? "")) seen.last_watched_at = ep.last_watched_at;
    }
  }
}

function keepLatest(into: Map<number, TraktMovie>, movie: TraktMovie) {
  const id = movie.movie.ids!.tmdb!;
  const have = into.get(id);
  if (!have || have.last_watched_at < movie.last_watched_at) into.set(id, movie);
}

function parseJson(data: Buffer, name: string): unknown {
  try {
    // Exports are UTF-8 and now and then carry a byte-order mark.
    return JSON.parse(data.toString("utf8").replace(/^﻿/, ""));
  } catch {
    throw new TraktError(`${name} is not valid JSON`);
  }
}

/** A zip as Trakt sends it, or one JSON file out of it. */
export function parseTraktExport(file: Buffer, filename: string): TraktBundle {
  let documents: { name: string; body: unknown }[];
  if (filename.toLowerCase().endsWith(".json")) {
    documents = [{ name: filename, body: parseJson(file, filename) }];
  } else {
    let entries;
    try {
      entries = readZip(file);
    } catch (error) {
      throw new TraktError(error instanceof ZipError ? error.message : "Could not read that archive");
    }
    documents = entries
      .filter((e) => e.name.toLowerCase().endsWith(".json"))
      .flatMap((e) => {
        // One unreadable member does not sink the rest.
        try {
          return [{ name: e.name, body: parseJson(e.data, e.name) }];
        } catch {
          return [];
        }
      });
  }

  const movies = new Map<number, TraktMovie>();
  const shows = new Map<number, TraktShow>();
  const ratings = new Map<string, TraktRating>();
  const watchlist = new Map<string, TraktListed>();
  const plays: Row[] = [];

  for (const doc of documents) {
    if (!Array.isArray(doc.body)) continue;
    const isWatchlist = /watchlist/i.test(doc.name);
    for (const row of doc.body) {
      if (!isRow(row)) continue;
      // Ratings: `{ rated_at, rating, type, movie | show }`. Episodes and seasons are not rated here.
      if (typeof row.rating === "number" && str(row.rated_at)) {
        const kind = isRow(row.movie) ? "movie" : isRow(row.show) && !isRow(row.episode) && !isRow(row.season) ? "show" : null;
        const target = kind === "movie" ? row.movie : kind === "show" ? row.show : null;
        const id = tmdbOf(target);
        if (kind && id) ratings.set(`${kind}-${id}`, { rated_at: str(row.rated_at)!, rating: row.rating, type: kind, [kind]: titled(target as Row) });
        continue;
      }
      // The watchlist: `{ listed_at, type, movie | show }`, told from a custom list by its file.
      if (str(row.listed_at)) {
        if (!isWatchlist) continue;
        const kind = isRow(row.movie) ? "movie" : isRow(row.show) && !isRow(row.episode) && !isRow(row.season) ? "show" : null;
        const target = kind === "movie" ? row.movie : kind === "show" ? row.show : null;
        const id = tmdbOf(target);
        if (kind && id) watchlist.set(`${kind}-${id}`, { listed_at: str(row.listed_at)!, type: kind, [kind]: titled(target as Row) });
        continue;
      }
      // Watched films: `{ plays, last_watched_at, movie }`.
      if (isRow(row.movie) && str(row.last_watched_at)) {
        if (tmdbOf(row.movie)) keepLatest(movies, { last_watched_at: str(row.last_watched_at)!, movie: titled(row.movie) });
        continue;
      }
      // Watched shows: `{ last_watched_at, show, seasons: [{ number, episodes }] }`.
      if (isRow(row.show) && Array.isArray(row.seasons)) {
        if (!tmdbOf(row.show)) continue;
        const seasons = row.seasons.flatMap((s) => {
          if (!isRow(s) || typeof s.number !== "number" || !Array.isArray(s.episodes)) return [];
          const episodes = s.episodes.flatMap((e) =>
            isRow(e) && typeof e.number === "number" ? [{ number: e.number, last_watched_at: str(e.last_watched_at) }] : [],
          );
          return episodes.length ? [{ number: s.number, episodes }] : [];
        });
        if (seasons.length) mergeShow(shows, { last_watched_at: str(row.last_watched_at) ?? "", show: titled(row.show), seasons });
        continue;
      }
      // A play from the history, folded in below where a watched list is missing.
      if (str(row.watched_at)) plays.push(row);
    }
  }

  // The play history is one row per viewing; used only for whichever half the watched lists lack.
  const foldMovies = movies.size === 0;
  const foldShows = shows.size === 0;
  for (const row of plays) {
    const when = str(row.watched_at)!;
    if (foldMovies && isRow(row.movie) && !isRow(row.episode) && tmdbOf(row.movie)) {
      keepLatest(movies, { last_watched_at: when, movie: titled(row.movie) });
    } else if (foldShows && isRow(row.episode) && isRow(row.show) && tmdbOf(row.show)) {
      const season = row.episode.season;
      const number = row.episode.number;
      if (typeof season !== "number" || typeof number !== "number") continue;
      mergeShow(shows, {
        last_watched_at: when,
        show: titled(row.show),
        seasons: [{ number: season, episodes: [{ number, last_watched_at: when }] }],
      });
    }
  }

  const bundle = { movies: [...movies.values()], shows: [...shows.values()], ratings: [...ratings.values()], watchlist: [...watchlist.values()] };
  if (!bundle.movies.length && !bundle.shows.length && !bundle.ratings.length && !bundle.watchlist.length) {
    throw new TraktError("Nothing to import in that file. Upload the zip Trakt emails you, without unpacking it.");
  }
  return bundle;
}
