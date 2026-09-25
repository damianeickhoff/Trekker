import "server-only";
import { tmdbPeek } from "./tmdb";

/**
 * Posters for the wall behind the sign-in form: this week's trending, from
 * whatever `TmdbCache` holds (Discover keeps it an hour at a time), never the
 * network, since nobody signed in has asked for anything yet. Stale is fine
 * for a backdrop. Empty when nothing is cached, and the page draws its plain
 * tiles instead.
 */

type Page = { results?: { poster_path?: string | null }[] };

const SOURCES = ["/trending/all/week", "/trending/movie/week", "/trending/tv/week", "/trending/all/day"];

export async function loginPosters(count = 32): Promise<string[]> {
  const pages = await Promise.all(SOURCES.map((path) => tmdbPeek<Page>(path).catch(() => null)));
  const posters = [
    ...new Set(pages.flatMap((p) => (p?.results ?? []).map((r) => r.poster_path).filter((x): x is string => Boolean(x)))),
  ];
  if (posters.length === 0) return [];
  // Repeated to fill the wall, offset so a repeat never sits beside itself.
  return Array.from({ length: count }, (_, i) => posters[(i * 7) % posters.length]);
}
