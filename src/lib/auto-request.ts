import "server-only";
import { mapLimit } from "./concurrency";
import { todayKey } from "./dates";
import { db } from "./db";
import { parseProviders, regionFor, subscribedAmong, summaryFor } from "./providers";
import { requestOnSeerr, type RequestOutcome } from "./request";
import type { MediaType } from "./tmdb";

/**
 * Auto-request: a smart list with the switch on asks Overseerr for what is new
 * on it, from the daily pass and nowhere else. Request all's rule decides
 * what qualifies (unseen by the list's owner, not on Plex, not already
 * requested or available, not streaming on a service the owner pays for),
 * because a request filed overnight deserves no less care than one filed by
 * pressing a button. The difference is that nobody is there to be asked, so
 * the subscription check always skips rather than offering to.
 *
 * It runs after the availability sweep, which is what knows whether a title
 * that turned up this morning is on Plex or streaming anywhere.
 */

/** The most one list may ask for in a day. A standing question can find sixty. */
export const AUTO_REQUEST_DAILY_CAP = 20;

export type NewOnList = { listId: string; titles: { mediaType: MediaType; tmdbId: number }[] };

type File = (userId: string, mediaType: MediaType, tmdbId: number) => Promise<RequestOutcome>;

const key = (mediaType: string, tmdbId: number) => `${mediaType}-${tmdbId}`;

/**
 * Files what each list found new, in the list's own order, up to what is left
 * of its day's twenty. Only successes are recorded: a request Overseerr turned
 * down was not made. `file` is the real request in the app and a fake in tests.
 */
export async function autoRequestNew(found: NewOnList[], file: File = requestOnSeerr, now = new Date()) {
  // Midnight where the server is, as `todayKey` counts days.
  const startOfDay = new Date(`${todayKey(now)}T00:00:00`);
  let filed = 0;
  let failed = 0;

  for (const { listId, titles } of found) {
    if (titles.length === 0) continue;
    const list = await db.mediaList.findUnique({
      where: { id: listId },
      select: { kind: true, autoRequest: true, userId: true, user: { select: { region: true, providers: true } } },
    });
    if (!list || list.kind !== "smart" || !list.autoRequest) continue;

    const usedToday = await db.mediaListRequest.count({ where: { listId, requestedAt: { gte: startOfDay } } });
    const room = AUTO_REQUEST_DAILY_CAP - usedToday;
    if (room <= 0) continue;

    const ids = (t: MediaType) => titles.filter((i) => i.mediaType === t).map((i) => i.tmdbId);
    const either = [
      { mediaType: "movie", tmdbId: { in: ids("movie") } },
      { mediaType: "tv", tmdbId: { in: ids("tv") } },
    ];
    const [seenFilms, seenShows, rows, asked] = await Promise.all([
      db.watchedMovie.findMany({ where: { userId: list.userId, movieId: { in: ids("movie") } }, select: { movieId: true } }),
      db.watchedEpisode.findMany({
        where: { userId: list.userId, showId: { in: ids("tv") } },
        select: { showId: true },
        distinct: ["showId"],
      }),
      db.availability.findMany({
        where: { OR: either },
        select: { mediaType: true, tmdbId: true, onPlex: true, overseerrStatus: true, providers: true },
      }),
      db.mediaListRequest.findMany({ where: { listId, OR: either }, select: { mediaType: true, tmdbId: true } }),
    ]);
    const seen = new Set([...seenFilms.map((f) => key("movie", f.movieId)), ...seenShows.map((s) => key("tv", s.showId))]);
    const byKey = new Map(rows.map((r) => [key(r.mediaType, r.tmdbId), r]));
    const already = new Set(asked.map((r) => key(r.mediaType, r.tmdbId)));
    const region = regionFor(list.user.region);
    const mine = parseProviders(list.user.providers);

    const wanted = titles
      .filter((t) => {
        const k = key(t.mediaType, t.tmdbId);
        if (seen.has(k) || already.has(k)) return false;
        const row = byKey.get(k);
        if (row?.onPlex || (row?.overseerrStatus ?? "none") !== "none") return false;
        const offers = summaryFor(row?.providers, region);
        return !(offers && subscribedAmong(mine, [...offers.stream, ...offers.free]).length > 0);
      })
      .slice(0, room);

    // Two at a time through the Overseerr gate, as Request all files them.
    const outcomes = await mapLimit(wanted, 2, async (t) => {
      const outcome = await file(list.userId, t.mediaType, t.tmdbId).catch(
        (): RequestOutcome => ({ ok: false, error: "Overseerr could not be reached." }),
      );
      if (outcome.ok) {
        await db.mediaListRequest.upsert({
          where: { listId_mediaType_tmdbId: { listId, mediaType: t.mediaType, tmdbId: t.tmdbId } },
          create: { listId, mediaType: t.mediaType, tmdbId: t.tmdbId, requestedAt: now },
          update: {},
        });
      }
      return outcome.ok;
    });
    filed += outcomes.filter(Boolean).length;
    failed += outcomes.filter((ok) => !ok).length;
  }
  return { filed, failed };
}
