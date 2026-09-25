import "server-only";
import { db } from "./db";
import { titleKey } from "./marks";

/**
 * What this person watched on today's date in earlier years, for Home.
 *
 * The play log rather than the watched tables: this is a question about days,
 * and a day spent rewatching something is still a day spent watching. Nothing
 * at all on most days, and the section hides rather than saying so.
 */

export type OnThisDayItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  year: number;
};

export async function getOnThisDay(userId: string, now = new Date(), take = 14): Promise<OnThisDayItem[]> {
  const first = await db.play.aggregate({ where: { userId }, _min: { watchedAt: true } });
  const firstYear = first._min.watchedAt?.getFullYear();
  if (firstYear === undefined || firstYear >= now.getFullYear()) return [];

  // One window per earlier year, built from the server's local calendar so "this
  // day" is the household's day; each is a plain range on (userId, watchedAt),
  // which the index covers, where picking month and day out in SQL would scan.
  const windows = [];
  for (let year = firstYear; year < now.getFullYear(); year++) {
    windows.push({
      watchedAt: { gte: new Date(year, now.getMonth(), now.getDate()), lt: new Date(year, now.getMonth(), now.getDate() + 1) },
    });
  }

  const plays = await db.play.findMany({
    where: { userId, OR: windows },
    orderBy: { watchedAt: "desc" },
    select: { mediaType: true, tmdbId: true, title: true, poster: true, watchedAt: true },
  });

  // One poster per title per year: four episodes of one show in a night is one memory.
  const seen = new Set<string>();
  const out: OnThisDayItem[] = [];
  for (const p of plays) {
    const year = p.watchedAt.getFullYear();
    const key = `${year}:${titleKey(p.mediaType, p.tmdbId)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mediaType: p.mediaType === "tv" ? "tv" : "movie", tmdbId: p.tmdbId, title: p.title, poster: p.poster, year });
    if (out.length === take) break;
  }
  return out;
}
