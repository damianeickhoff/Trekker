import "server-only";
import { db } from "./db";

/**
 * The "this time last year" card on the home page.
 *
 * Reads the play log rather than the watched tables, which is the point: this is
 * a question about days, and a day someone spent rewatching something is still a
 * day they spent watching.
 */

export type OnThisDayEntry = {
  key: string;
  yearsAgo: number;
  title: string;
  subtitle: string;
  poster: string | null;
  href: string;
};

/**
 * What was being watched on today's date in earlier years.
 *
 * Returns nothing at all rather than an empty state: on most days there is no
 * answer, and a card that spends the rest of the year saying "nothing" is worse
 * than one that only appears when it has something to say.
 */
export async function getOnThisDay(userId: string, limit = 6): Promise<OnThisDayEntry[]> {
  const today = new Date();
  const month = today.getMonth();
  const date = today.getDate();

  const first = await db.play.aggregate({ where: { userId }, _min: { watchedAt: true } });
  const firstYear = first._min.watchedAt?.getFullYear();
  if (firstYear === undefined || firstYear >= today.getFullYear()) return [];

  // One range per earlier year rather than a scan of the whole history with the
  // month and day picked out in JS. Each range is a plain window on `watchedAt`,
  // so the [userId, watchedAt] index covers all of them — and building them from
  // local dates keeps "this day" meaning the viewer's day, which no amount of
  // SQL date arithmetic on a stored instant would.
  const windows = [];
  for (let year = firstYear; year < today.getFullYear(); year++) {
    const start = new Date(year, month, date);
    const end = new Date(year, month, date + 1);
    windows.push({ watchedAt: { gte: start, lt: end } });
  }

  const plays = await db.play.findMany({
    where: { userId, OR: windows },
    orderBy: { watchedAt: "desc" },
    select: {
      id: true,
      mediaType: true,
      tmdbId: true,
      title: true,
      poster: true,
      seasonNumber: true,
      episodeNumber: true,
      watchedAt: true,
    },
  });

  const entries: OnThisDayEntry[] = [];
  const seen = new Set<string>();

  for (const play of plays) {
    // One entry per title per year: a night spent on four episodes of the same
    // show is one memory, not four.
    const year = play.watchedAt.getFullYear();
    const fingerprint = `${year}-${play.mediaType}-${play.tmdbId}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const yearsAgo = today.getFullYear() - year;
    const isEpisode = play.mediaType === "tv";

    entries.push({
      key: `otd-${play.id}`,
      yearsAgo,
      title: play.title,
      subtitle: isEpisode
        ? `S${String(play.seasonNumber ?? 0).padStart(2, "0")}E${String(
            play.episodeNumber ?? 0,
          ).padStart(2, "0")}`
        : "Movie",
      poster: play.poster,
      href: isEpisode ? `/title/tv/${play.tmdbId}` : `/title/movie/${play.tmdbId}`,
    });

    if (entries.length >= limit) break;
  }

  return entries;
}
