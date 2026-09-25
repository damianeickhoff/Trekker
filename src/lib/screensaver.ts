import "server-only";
import { db } from "./db";
import { cacheKey, movieDetailsKey, tvDetailsKey } from "./tmdb";

/**
 * What the screensaver cycles through: titles from this person's history and
 * watchlist, each with a backdrop the cache already holds. A title nobody has
 * opened since it was saved has no cached details and simply is not shown;
 * the screensaver never asks TMDB for anything.
 */

export type Slide = { key: string; title: string; backdrop: string; poster: string | null };

/** Enough for a few hours without a repeat at twenty seconds each, and a bounded read. */
const FROM_EACH = 16;
export const SLIDES_MAX = 24;

type Candidate = { mediaType: "movie" | "tv"; tmdbId: number; title: string; poster: string | null; backdrop?: string | null };

function detailsKey(c: Candidate) {
  const k = c.mediaType === "tv" ? tvDetailsKey(c.tmdbId) : movieDetailsKey(c.tmdbId);
  return cacheKey(k.path, k.params);
}

/** History first and watchlist second, taken alternately, so neither crowds out the other. */
function interleave<T>(a: T[], b: T[]) {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

export async function screensaverSlides(userId: string): Promise<Slide[]> {
  const [shows, films, saved] = await Promise.all([
    // (userId, lastWatchedAt): the shows most recently watched, whose backdrop the row carries.
    db.titleState.findMany({
      where: { userId, watchedCount: { gt: 0 } },
      orderBy: { lastWatchedAt: "desc" },
      take: FROM_EACH,
      select: { showId: true, showName: true, showPoster: true, backdrop: true },
    }),
    db.play.findMany({
      where: { userId, mediaType: "movie" },
      orderBy: { watchedAt: "desc" },
      distinct: ["tmdbId"],
      take: FROM_EACH / 2,
      select: { tmdbId: true, title: true, poster: true },
    }),
    db.watchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
      take: FROM_EACH,
      select: { mediaType: true, tmdbId: true, title: true, poster: true },
    }),
  ]);

  const history: Candidate[] = interleave<Candidate>(
    shows.map((s) => ({ mediaType: "tv" as const, tmdbId: s.showId, title: s.showName, poster: s.showPoster, backdrop: s.backdrop })),
    films.map((f) => ({ mediaType: "movie" as const, tmdbId: f.tmdbId, title: f.title, poster: f.poster })),
  );
  const watchlist: Candidate[] = saved.flatMap((w) =>
    w.mediaType === "movie" || w.mediaType === "tv" ? [{ mediaType: w.mediaType, tmdbId: w.tmdbId, title: w.title, poster: w.poster }] : [],
  );

  const seen = new Set<string>();
  const candidates = interleave(history, watchlist).filter((c) => {
    const key = `${c.mediaType}-${c.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const lacking = candidates.filter((c) => !c.backdrop);
  const rows = lacking.length
    ? await db.tmdbCache.findMany({ where: { key: { in: lacking.map(detailsKey) } }, select: { key: true, body: true } })
    : [];
  const backdrops = new Map<string, string>();
  for (const row of rows) {
    try {
      const path = (JSON.parse(row.body) as { backdrop_path?: string | null }).backdrop_path;
      if (path) backdrops.set(row.key, path);
    } catch {
      // A damaged cache row costs its slide and nothing else.
    }
  }

  return candidates
    .map((c) => ({ c, backdrop: c.backdrop ?? backdrops.get(detailsKey(c)) ?? null }))
    .filter((x): x is { c: Candidate; backdrop: string } => Boolean(x.backdrop))
    .slice(0, SLIDES_MAX)
    .map(({ c, backdrop }) => ({ key: `${c.mediaType}-${c.tmdbId}`, title: c.title, backdrop, poster: c.poster }));
}

/**
 * Where waking returns to: a path on this instance, or Home. Anything that is
 * not a plain local path (another origin, a protocol-relative address) goes
 * home, so the parameter cannot be used to send someone elsewhere.
 */
export function safeReturn(from: string | string[] | undefined): string {
  const value = Array.isArray(from) ? from[0] : from;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.startsWith("/screensaver")) return "/";
  return value;
}
