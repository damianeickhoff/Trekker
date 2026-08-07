import "server-only";

/**
 * Trakt import, using their public read endpoints. That only needs an API
 * client id (no OAuth round trip), but it does mean the Trakt profile being
 * imported has to be public — a private profile returns 401/404.
 */

const BASE = "https://api.trakt.tv";

/**
 * Trakt credentials are stored per user (see the User model). An instance-wide
 * TRAKT_CLIENT_ID is still honoured as a fallback so an admin can set one up
 * once and let everyone import with just their username.
 */
export function defaultTraktClientId(): string | null {
  return process.env.TRAKT_CLIENT_ID?.trim() || null;
}

export class TraktError extends Error {}

async function trakt<T>(path: string, clientId: string): Promise<T> {
  if (!clientId) throw new TraktError("No Trakt client id configured");

  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": clientId,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 404) {
    throw new TraktError("No such Trakt user, or the profile is private");
  }
  if (res.status === 401 || res.status === 403) {
    // Trakt answers 401 both for a bad client id and for a profile that is not
    // public, and does not distinguish them in the body.
    throw new TraktError("Trakt refused that request — check the client id, and that the profile is public");
  }
  if (!res.ok) {
    throw new TraktError(`Trakt returned ${res.status}`);
  }

  return res.json() as Promise<T>;
}

type TraktIds = { trakt: number; tmdb: number | null };

export type TraktMovie = {
  plays: number;
  last_watched_at: string;
  movie: { title: string; year: number | null; ids: TraktIds };
};

export type TraktShow = {
  last_watched_at: string;
  show: { title: string; year: number | null; ids: TraktIds };
  seasons?: {
    number: number;
    episodes: { number: number; plays: number; last_watched_at: string }[];
  }[];
};

export function getWatchedMovies(username: string, clientId: string) {
  return trakt<TraktMovie[]>(
    `/users/${encodeURIComponent(username)}/watched/movies`,
    clientId,
  );
}

export function getWatchedShows(username: string, clientId: string) {
  return trakt<TraktShow[]>(
    `/users/${encodeURIComponent(username)}/watched/shows`,
    clientId,
  );
}

/**
 * Cheap credential check for the settings form: a bad client id comes back 401,
 * a private or missing profile 401/404. Anything that resolves means the pair
 * is usable for an import.
 */
export async function verifyTrakt(username: string, clientId: string) {
  await trakt<{ username: string }>(
    `/users/${encodeURIComponent(username)}`,
    clientId,
  );
}
