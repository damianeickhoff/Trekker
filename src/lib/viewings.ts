import "server-only";
import { todayKey } from "./dates";
import { db } from "./db";
import { KNOWN_PROVIDERS, parseProviders } from "./providers";
import { instanceAdmin } from "./title";
import { placeSuggestions, viewingDay } from "./viewing-words";

/*
 * One person's viewings of a film or an episode, for the block on its page: every play,
 * newest first, with where it was and the line they wrote about it. Rows only,
 * never TMDB, so the block is drawn with the page rather than streamed.
 */

export type Viewing = {
  id: string;
  /** The day as a date key, for the sheet's date field. */
  day: string;
  /** "Today", "Wed 23 Sep", "Wed 23 Sep 2025". */
  label: string;
  place: string | null;
  note: string | null;
  /** Who reported it: "manual" for a tick here, "plex", "trakt" or "backfill". `sourceWords` says it. */
  source: string;
};

/** A film, or one episode of a show. */
export type ViewingTarget =
  | { mediaType: "movie"; tmdbId: number }
  | { mediaType: "tv"; tmdbId: number; season: number; episode: number };

export async function viewingsOf(userId: string, target: ViewingTarget): Promise<Viewing[]> {
  // A film's plays carry no episode numbers: `recordPlay` writes nulls for one.
  const where =
    target.mediaType === "movie"
      ? { userId, mediaType: "movie", tmdbId: target.tmdbId, seasonNumber: null, episodeNumber: null }
      : { userId, mediaType: "tv", tmdbId: target.tmdbId, seasonNumber: target.season, episodeNumber: target.episode };
  const rows = await db.play.findMany({
    where,
    orderBy: { watchedAt: "desc" },
    select: { id: true, watchedAt: true, place: true, note: true, source: true },
  });
  const today = todayKey();
  return rows.map((r) => {
    const day = todayKey(r.watchedAt);
    return { id: r.id, day, label: viewingDay(day, today), place: r.place, note: r.note, source: r.source };
  });
}

/** How many of the places someone has typed before are worth offering again. */
const USED_PLACES = 12;

/**
 * What the sheet offers under Where. Read only for someone who has a viewing
 * to edit, so a page nobody has watched from pays nothing for it.
 */
export async function placesFor(userId: string): Promise<string[]> {
  const [admin, me, used] = await Promise.all([
    instanceAdmin(),
    db.user.findUnique({ where: { id: userId }, select: { providers: true } }),
    db.play.findMany({
      where: { userId, place: { not: null } },
      orderBy: { watchedAt: "desc" },
      distinct: ["place"],
      take: USED_PLACES,
      select: { place: true },
    }),
  ]);
  const chosen = new Set(parseProviders(me?.providers));
  return placeSuggestions({
    plex: Boolean(admin?.plexMachineId),
    services: KNOWN_PROVIDERS.filter((p) => chosen.has(p.id)).map((p) => p.name),
    used: used.flatMap((r) => (r.place ? [r.place] : [])),
  });
}
