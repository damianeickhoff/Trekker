import "server-only";
import { dailyIndex, isPosterPath } from "./background";
import { db } from "./db";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Today's poster for the artwork background: one of the titles played in the
 * last year, the same one all day, chosen by the person and the day
 * (`dailyIndex`). One grouped query over `Play`, which carries each title's
 * poster itself, so no TMDB call; sorted by title so the pick does not shift
 * when the same titles come back in another order. Null when there is
 * nothing to show, and the layer then stays the page colour.
 */
export async function dailyPoster(userId: string, day: string): Promise<string | null> {
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - YEAR_MS);
  const titles = await db.play.groupBy({
    by: ["mediaType", "tmdbId"],
    where: { userId, watchedAt: { gte: since }, poster: { not: null } },
    _max: { poster: true },
    orderBy: [{ mediaType: "asc" }, { tmdbId: "asc" }],
  });
  const posters = titles.map((t) => t._max.poster).filter(isPosterPath);
  const i = dailyIndex(userId, day, posters.length);
  return i < 0 ? null : posters[i];
}
