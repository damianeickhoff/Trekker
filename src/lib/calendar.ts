import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { getMovie, getSeason, getTv, tmdbConfigured } from "./tmdb";

/**
 * What is *coming*, for this user: episodes of shows they are watching or have
 * queued, series premieres, and release dates for watchlisted films. Nothing
 * here looks at watch history — the calendar is a schedule, not a diary.
 *
 * Dates are handled as plain `YYYY-MM-DD` strings throughout. TMDB air dates
 * have no time or zone, and turning them into local Date objects is how an
 * episode ends up on the wrong day for anyone west of UTC.
 */

export type CalendarKind = "episode" | "premiere" | "release";

/** Episodes worth calling out: the ones people plan an evening around. */
export type CalendarTag =
  | "series-premiere"
  | "season-premiere"
  | "season-finale"
  | "finale";

export type CalendarEntry = {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  kind: CalendarKind;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  detail: string;
  tag: CalendarTag | null;
  poster: string | null;
  backdrop: string | null;
};

export type UpcomingOptions = {
  /** Inclusive YYYY-MM-DD bounds. */
  from: string;
  to: string;
  /** Cap on how many shows are resolved against TMDB. */
  maxShows?: number;
  /**
   * `"all"` fetches the season around each show's next episode, which is what
   * fills out a week. `"next"` uses only TMDB's `next_episode_to_air` — one
   * request per show instead of two, enough for a short "what is next" list.
   */
  episodes?: "all" | "next";
};

const DEFAULT_MAX_SHOWS = 80;
const FANOUT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Date helpers ---------------------------------------------------------

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function todayKey() {
  return toDateKey(new Date());
}

export function addDays(date: string, days: number) {
  return toDateKey(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS));
}

export function daysBetween(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/** The Monday of the week containing `date`, matching the en-GB week used elsewhere. */
export function startOfWeek(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((parsed.getUTCDay() + 6) % 7));
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isValidDateKey(date: string | undefined): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Soft relative wording. Exact dates read as homework; "in 3 days" is how
 * people actually think about what is next.
 */
export function relativeDay(date: string, today: string) {
  const days = daysBetween(today, date);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  if (days < 14) return "Next week";
  return "Over 2 weeks";
}

function inRange(date: string | null | undefined, from: string, to: string) {
  return Boolean(date) && date! >= from && date! <= to;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ---- Data -----------------------------------------------------------------

export async function getUpcoming(
  userId: string,
  { from, to, maxShows = DEFAULT_MAX_SHOWS, episodes = "all" }: UpcomingOptions,
): Promise<CalendarEntry[]> {
  if (!tmdbConfigured()) return [];

  const [watchedShows, watchlist] = await Promise.all([
    db.watchedEpisode.findMany({
      where: { userId },
      orderBy: { watchedAt: "desc" },
      select: { showId: true, showName: true, showPoster: true },
    }),
    db.watchlistItem.findMany({ where: { userId } }),
  ]);

  // Most recently watched first, so the cap trims shows they have drifted from.
  const shows = new Map<number, { title: string; poster: string | null }>();
  for (const e of watchedShows) {
    if (!shows.has(e.showId)) shows.set(e.showId, { title: e.showName, poster: e.showPoster });
  }
  for (const item of watchlist) {
    if (item.mediaType === "tv" && !shows.has(item.tmdbId)) {
      shows.set(item.tmdbId, { title: item.title, poster: item.poster });
    }
  }

  const movies = watchlist.filter((item) => item.mediaType === "movie");

  const [showEntries, movieEntries] = await Promise.all([
    mapLimit([...shows.entries()].slice(0, maxShows), FANOUT, ([showId, show]) =>
      showAirings(showId, show, from, to, episodes),
    ),
    mapLimit(movies, FANOUT, async (item) => {
      const detail = await getMovie(item.tmdbId).catch(() => null);
      if (!detail || !inRange(detail.release_date, from, to)) return [];

      return [
        {
          key: `release-${detail.id}`,
          date: detail.release_date,
          kind: "release" as const,
          mediaType: "movie" as const,
          tmdbId: detail.id,
          title: detail.title,
          detail: "Release date",
          tag: null,
          poster: detail.poster_path ?? item.poster,
          backdrop: detail.backdrop_path,
        },
      ];
    }),
  ]);

  return [...showEntries.flat(), ...movieEntries.flat()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}

/**
 * Episodes of one show that air inside the range. TMDB only exposes a single
 * `next_episode_to_air`, so in `"all"` mode the season it belongs to is fetched
 * in full — that is what turns "the next episode" into a week's worth of them.
 */
async function showAirings(
  showId: number,
  show: { title: string; poster: string | null },
  from: string,
  to: string,
  mode: "all" | "next",
): Promise<CalendarEntry[]> {
  const detail = await getTv(showId).catch(() => null);
  if (!detail) return [];

  const poster = detail.poster_path ?? show.poster;
  const backdrop = detail.backdrop_path;
  const entries: CalendarEntry[] = [];

  const numbered = detail.seasons.filter((s) => s.season_number > 0);
  const finalSeason = Math.max(0, ...numbered.map((s) => s.season_number));
  // TMDB only flips a show to Ended once it is over, so the last episode of the
  // last season is a series finale rather than a season one only when the show
  // is already marked done.
  const showOver = detail.status === "Ended" || detail.status === "Canceled";

  /** `total` is the episode count of the season the episode belongs to. */
  function tagFor(season: number, episode: number, total: number): CalendarTag | null {
    if (episode === 1) return season === 1 ? "series-premiere" : "season-premiere";
    if (total > 0 && episode === total) {
      return season === finalSeason && showOver ? "finale" : "season-finale";
    }
    return null;
  }

  // A watchlisted show that has not started yet gets a premiere marker.
  if (!detail.last_episode_to_air && inRange(detail.first_air_date, from, to)) {
    entries.push({
      key: `premiere-${showId}`,
      date: detail.first_air_date,
      kind: "premiere",
      mediaType: "tv",
      tmdbId: showId,
      title: detail.name,
      detail: "Series premiere",
      tag: "series-premiere",
      poster,
      backdrop,
    });
  }

  const next = detail.next_episode_to_air;
  // Nothing scheduled, or the whole range sits before the next episode airs.
  if (!next || next.air_date > to) return entries;

  if (mode === "next") {
    if (inRange(next.air_date, from, to)) {
      const total =
        numbered.find((s) => s.season_number === next.season_number)?.episode_count ?? 0;

      entries.push({
        key: `episode-${showId}-${next.season_number}-${next.episode_number}`,
        date: next.air_date,
        kind: "episode",
        mediaType: "tv",
        tmdbId: showId,
        title: detail.name,
        detail: `S${pad(next.season_number)}E${pad(next.episode_number)}`,
        tag: tagFor(next.season_number, next.episode_number, total),
        poster,
        backdrop,
      });
    }
    return entries;
  }

  // A range can straddle a season finale, so look at the following season too.
  const seasonNumbers = [next.season_number, next.season_number + 1].filter((n) =>
    detail.seasons.some((s) => s.season_number === n),
  );

  const seasons = await mapLimit(seasonNumbers, 2, (n) =>
    getSeason(showId, n).catch(() => null),
  );

  for (const season of seasons) {
    // The season's own list is the authoritative episode count — it includes
    // the ones that have not aired yet, which is what makes a finale a finale.
    const total = season?.episodes.length ?? 0;

    for (const episode of season?.episodes ?? []) {
      if (!inRange(episode.air_date, from, to)) continue;

      entries.push({
        key: `episode-${showId}-${episode.season_number}-${episode.episode_number}`,
        date: episode.air_date!,
        kind: "episode",
        mediaType: "tv",
        tmdbId: showId,
        title: detail.name,
        detail: `S${pad(episode.season_number)}E${pad(episode.episode_number)}${
          episode.name ? ` · ${episode.name}` : ""
        }`,
        tag: tagFor(episode.season_number, episode.episode_number, total),
        poster,
        backdrop,
      });
    }
  }

  return entries;
}
