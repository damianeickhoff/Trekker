import "server-only";
import { cache } from "react";
import { db } from "./db";
import { parseProviders, regionFor, subscribedAmong, summaryFor } from "./providers";
import { getPerson, type PersonCredit, type PersonDetails } from "./tmdb";

/**
 * An actor's page: who they are from TMDB through the cache (which also keeps
 * their `Person` row, and with it the backdrop of what they are best known
 * for), and their work set against this person's own history.
 */

export const loadPerson = cache(async (id: number): Promise<PersonDetails | null> => getPerson(id).catch(() => null));

/** TMDB's talk and news genres: appearances as themselves, not parts. */
const NOT_A_PART = new Set([10767, 10763]);
const AS_SELF = /^(self|himself|herself|themselves)\b/i;

export type Credit = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  year: string | null;
  role: string;
  weight: number;
  date: string;
};

/**
 * Their parts, one per title however many characters they played in it,
 * newest first with the announced-but-undated at the top. Chat shows, news and
 * appearances as themselves are left out: forty talk-show spots would bury the
 * work and make "seen N of M" meaningless.
 */
export function partsOf(cast: PersonCredit[]): Credit[] {
  const byTitle = new Map<string, Credit>();
  for (const c of cast) {
    if (c.media_type !== "movie" && c.media_type !== "tv") continue;
    if ((c.genre_ids ?? []).some((g) => NOT_A_PART.has(g))) continue;
    if (c.character && AS_SELF.test(c.character.trim())) continue;
    const key = `${c.media_type}-${c.id}`;
    const date = c.release_date || c.first_air_date || "";
    const known = byTitle.get(key);
    if (known) {
      if (c.character && !known.role.includes(c.character)) known.role = known.role ? `${known.role}, ${c.character}` : c.character;
      continue;
    }
    byTitle.set(key, {
      mediaType: c.media_type,
      tmdbId: c.id,
      title: c.title || c.name || "Untitled",
      poster: c.poster_path ?? null,
      year: date ? date.slice(0, 4) : null,
      role: c.character ?? "",
      // Popularity with a nudge for long runs, as `getPerson` ranks "known for".
      weight: (c.popularity ?? 0) + (c.episode_count ?? 0),
      date,
    });
  }
  return [...byTitle.values()].sort((a, b) => {
    if (!a.date !== !b.date) return a.date ? 1 : -1;
    return b.date.localeCompare(a.date);
  });
}

export type Filmography = {
  items: (Credit & { seen: boolean; onMine: boolean })[];
  seen: number;
  lastSeen: { title: string; at: Date } | null;
  knownFor: string[];
};

/** Their parts, which of them this person has seen, and which they could watch tonight. */
export async function filmographyFor(userId: string, person: PersonDetails): Promise<Filmography> {
  const parts = partsOf(person.combined_credits?.cast ?? []);
  const films = parts.filter((p) => p.mediaType === "movie").map((p) => p.tmdbId);
  const shows = parts.filter((p) => p.mediaType === "tv").map((p) => p.tmdbId);

  const [watchedFilms, watchedShows, availability, me] = await Promise.all([
    films.length
      ? db.watchedMovie.findMany({
          where: { userId, movieId: { in: films } },
          select: { movieId: true, watchedAt: true, lastWatchedAt: true },
        })
      : [],
    shows.length
      ? db.watchedEpisode.groupBy({
          by: ["showId"],
          where: { userId, showId: { in: shows } },
          _max: { watchedAt: true, lastWatchedAt: true },
        })
      : [],
    parts.length
      ? db.availability.findMany({
          where: {
            OR: [
              ...(films.length ? [{ mediaType: "movie", tmdbId: { in: films } }] : []),
              ...(shows.length ? [{ mediaType: "tv", tmdbId: { in: shows } }] : []),
            ],
          },
          select: { mediaType: true, tmdbId: true, onPlex: true, providers: true },
        })
      : [],
    db.user.findUnique({ where: { id: userId }, select: { region: true, providers: true } }),
  ]);

  const seenAt = new Map<string, Date>();
  for (const f of watchedFilms) seenAt.set(`movie-${f.movieId}`, f.lastWatchedAt ?? f.watchedAt);
  for (const s of watchedShows) {
    const at = s._max.lastWatchedAt ?? s._max.watchedAt;
    if (at) seenAt.set(`tv-${s.showId}`, at);
  }

  // "On your services": on the Plex server, or streaming on something they pay
  // for, as far as the daily job has looked. A title it has never looked at is
  // not claimed either way.
  const region = regionFor(me?.region);
  const mine = parseProviders(me?.providers);
  const watchable = new Set(
    availability
      .filter((a) => {
        if (a.onPlex) return true;
        const offers = summaryFor(a.providers, region);
        return offers ? subscribedAmong(mine, [...offers.stream, ...offers.free]).length > 0 : false;
      })
      .map((a) => `${a.mediaType}-${a.tmdbId}`),
  );

  let lastSeen: Filmography["lastSeen"] = null;
  const items = parts.map((p) => {
    const at = seenAt.get(`${p.mediaType}-${p.tmdbId}`);
    if (at && (!lastSeen || at > lastSeen.at)) lastSeen = { title: p.title, at };
    return { ...p, seen: Boolean(at), onMine: watchable.has(`${p.mediaType}-${p.tmdbId}`) };
  });

  const knownFor = [...parts]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((p) => p.title);

  return { items, seen: items.filter((i) => i.seen).length, lastSeen, knownFor };
}

/**
 * The filmography's chips, in the order they stand. "Seen" is anything the
 * person has watched: a film watched, or a show with at least one episode
 * watched, which is what the tick on the poster already means.
 */
export const PERSON_FILTERS = ["all", "seen", "unseen", "services"] as const;
export type PersonFilter = (typeof PERSON_FILTERS)[number];

/** `?show=`, where anything unknown is everything. */
export function parsePersonFilter(show: string | undefined): PersonFilter {
  return (PERSON_FILTERS as readonly string[]).includes(show ?? "") ? (show as PersonFilter) : "all";
}

export function filterFilmography<T extends { seen: boolean; onMine: boolean }>(items: T[], filter: PersonFilter): T[] {
  switch (filter) {
    case "seen":
      return items.filter((i) => i.seen);
    case "unseen":
      return items.filter((i) => !i.seen);
    case "services":
      return items.filter((i) => i.onMine);
    case "all":
      return items;
  }
}

/** "Actor", "Director": what TMDB says they are best known for doing, as a noun. */
export function departmentNoun(department: string | undefined) {
  switch (department) {
    case "Acting":
      return "Actor";
    case "Directing":
      return "Director";
    case "Writing":
      return "Writer";
    case "Production":
      return "Producer";
    default:
      return department || null;
  }
}
