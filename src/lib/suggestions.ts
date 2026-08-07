import "server-only";
import { db } from "./db";
import {
  getRecommendations,
  popular,
  tmdbConfigured,
  trending,
  type NormalisedItem,
} from "./tmdb";

type Seed = { mediaType: "movie" | "tv"; id: number };

/**
 * Recommendations built from what the viewer has actually engaged with: recent
 * movies, shows they are watching, and anything on the watchlist. Titles that
 * several seeds agree on float to the top.
 */
export async function getSuggestions(userId: string, take = 16): Promise<NormalisedItem[]> {
  if (!tmdbConfigured()) return [];

  // The full history, not just the recent slice used for seeds: a film watched
  // two years ago is still a film you have seen, and suggesting it back is the
  // fastest way to make a recommendations row look broken.
  const [movies, episodes, watchlist] = await Promise.all([
    db.watchedMovie.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
      select: { movieId: true },
    }),
    db.watchedEpisode.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
      select: { showId: true },
      distinct: ["showId"],
    }),
    db.watchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
      select: { mediaType: true, tmdbId: true },
    }),
  ]);

  // Seeds stay recent — what you watched last says most about what you want now.
  const seeds: Seed[] = [
    ...movies.slice(0, 4).map((m) => ({ mediaType: "movie" as const, id: m.movieId })),
    ...episodes.slice(0, 4).map((e) => ({ mediaType: "tv" as const, id: e.showId })),
    ...watchlist.slice(0, 4).map((w) => ({
      mediaType: w.mediaType === "tv" ? ("tv" as const) : ("movie" as const),
      id: w.tmdbId,
    })),
  ];

  if (seeds.length === 0) return [];

  const known = new Set<string>([
    ...movies.map((m) => `movie-${m.movieId}`),
    ...episodes.map((e) => `tv-${e.showId}`),
    ...watchlist.map((w) => `${w.mediaType}-${w.tmdbId}`),
  ]);

  // Cap the fan-out: eight seeds is plenty and keeps this to eight cached calls.
  const unique = [...new Map(seeds.map((s) => [`${s.mediaType}-${s.id}`, s])).values()].slice(
    0,
    8,
  );

  // What everyone is watching, alongside what this viewer's history points at.
  const [lists, trendingNow, popularShows, popularFilms] = await Promise.all([
    Promise.all(unique.map((seed) => getRecommendations(seed.mediaType, seed.id).catch(() => []))),
    trending("all", "week").catch(() => []),
    popular("tv").catch(() => []),
    popular("movie").catch(() => []),
  ]);

  const scored = new Map<string, { item: NormalisedItem; hits: number }>();
  for (const list of lists) {
    // Only the strongest few from each seed, or one popular title dominates.
    for (const item of list.slice(0, 12)) {
      const key = `${item.mediaType}-${item.id}`;
      if (known.has(key)) continue;

      const existing = scored.get(key);
      if (existing) existing.hits += 1;
      else scored.set(key, { item, hits: 1 });
    }
  }

  const personal = [...scored.values()]
    .sort((a, b) => b.hits - a.hits || b.item.score - a.item.score)
    .map((entry) => entry.item);

  // Trending first, then the popular lists, de-duplicated in that order.
  const mainstream = dedupe([...trendingNow, ...popularShows, ...popularFilms]).filter(
    (item) => !known.has(`${item.mediaType}-${item.id}`),
  );

  /**
   * TMDB's recommendations reach a long way back — ask about one 90s film and
   * it will happily suggest six more. That is worth having, but not as the bulk
   * of the row, so the two sources are woven two-to-one in favour of what is
   * actually current. Anything a seed agrees on *and* is trending has already
   * floated to the front of `mainstream` by being in both lists.
   */
  const result: NormalisedItem[] = [];
  const seen = new Set<string>();
  let m = 0;
  let p = 0;

  while (result.length < take && (m < mainstream.length || p < personal.length)) {
    const wantPersonal = result.length % 3 === 2;
    const next =
      (wantPersonal ? personal[p++] : mainstream[m++]) ??
      (wantPersonal ? mainstream[m++] : personal[p++]);
    if (!next) continue;

    const key = `${next.mediaType}-${next.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(next);
  }

  return result;
}

function dedupe(items: NormalisedItem[]) {
  return [...new Map(items.map((i) => [`${i.mediaType}-${i.id}`, i])).values()];
}
