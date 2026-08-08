import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { rangeFilter, type Range } from "./range";
import { getMovie, getTv, tmdbConfigured } from "./tmdb";

export type FunStats = {
  topGenres: { name: string; count: number }[];
  busiestWeekday: { label: string; minutes: number } | null;
  biggestDay: { date: Date; minutes: number } | null;
  longestStreak: number;
  averageEpisode: number | null;
  mostWatchedShow: { name: string; count: number } | null;
  /** The film they keep going back to. Null until something has been seen twice. */
  mostRewatched: { title: string; count: number } | null;
  /** The face that turns up in most of what they watch. */
  topActor: { id: number; name: string; count: number } | null;
  /** Oldest film in their history, by release year rather than by logging date. */
  oldestMovie: { id: number; title: string; year: number } | null;
  /** The TMDB collection they have seen the most films from. */
  topFranchise: { id: number; name: string; count: number } | null;
  binges: number;
  firstLogged: Date | null;
  /**
   * The show whose episodes have drawn the most thumbs up, and how the verdicts
   * fell across everything.
   *
   * `EpisodeRating` was written by the season browser and read by nothing —
   * every thumb was stored and then never counted towards a statistic, a badge,
   * or a line on the profile. This is where it lands.
   */
  episodeVerdicts: {
    liked: number;
    disliked: number;
    /** Needs at least two verdicts to be worth naming. */
    favouriteShow: { name: string; liked: number } | null;
  } | null;
};

/** Titles looked up on TMDB per side (films, shows) for the flavour stats. */
const DETAIL_BUDGET = 20;
/** How far down a cast list still counts as "being in it". */
const CAST_DEPTH = 10;
/** Parallel TMDB requests, matching the fan-out the achievements use. */
const FANOUT = 6;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A day key in local time, so "what day was that" matches the viewer's idea. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export async function getFunStats(userId: string, range?: Range): Promise<FunStats> {
  // Every read below is scoped the same way, so the habits panel and the charts
  // beside it are always describing the same window.
  const window = range ? rangeFilter(range) : {};
  // Habits come from the log: a streak measures how often someone sat down to
  // watch something, and a comfort rewatch is still sitting down to watch
  // something. The title lists stay distinct — genres and franchises are facts
  // about what was watched, not about how many times.
  const [plays, movies, episodes] = await Promise.all([
    db.play.findMany({
      where: { userId, ...window },
      select: { mediaType: true, tmdbId: true, title: true, runtime: true, watchedAt: true },
      orderBy: { watchedAt: "desc" },
    }),
    // Inside a window these come from the log too, so "oldest film" and "top
    // franchise" describe what was watched *then* rather than ever.
    range
      ? db.play
          .findMany({
            where: { userId, mediaType: "movie", ...window },
            select: { tmdbId: true, title: true },
            distinct: ["tmdbId"],
            orderBy: { watchedAt: "desc" },
          })
          .then((rows) => rows.map((row) => ({ movieId: row.tmdbId, title: row.title })))
      : db.watchedMovie.findMany({
          where: { userId },
          select: { movieId: true, title: true },
          orderBy: { watchedAt: "desc" },
        }),
    range
      ? db.play
          .findMany({
            where: { userId, mediaType: "tv", ...window },
            select: { tmdbId: true },
            distinct: ["tmdbId"],
          })
          .then((rows) => rows.map((row) => ({ showId: row.tmdbId })))
      : db.watchedEpisode.findMany({
          where: { userId },
          select: { showId: true },
          distinct: ["showId"],
        }),
  ]);

  const all = plays.map((p) => ({ minutes: p.runtime, at: p.watchedAt }));
  const episodePlays = plays.filter((p) => p.mediaType === "tv");

  // Minutes per weekday, and per calendar day.
  const weekdayMinutes = new Array(7).fill(0) as number[];
  const perDay = new Map<string, { date: Date; minutes: number; items: number }>();

  for (const entry of all) {
    weekdayMinutes[entry.at.getDay()] += entry.minutes;

    const key = dayKey(entry.at);
    const day = perDay.get(key) ?? { date: entry.at, minutes: 0, items: 0 };
    day.minutes += entry.minutes;
    day.items += 1;
    perDay.set(key, day);
  }

  const busiestIndex = weekdayMinutes.reduce(
    (best, minutes, i) => (minutes > weekdayMinutes[best] ? i : best),
    0,
  );

  const days = [...perDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const biggestDay = days.reduce<{ date: Date; minutes: number } | null>(
    (best, day) => (best === null || day.minutes > best.minutes ? day : best),
    null,
  );

  // Longest run of consecutive calendar days with something logged.
  let longestStreak = 0;
  let current = 0;
  let previous: Date | null = null;
  for (const day of days) {
    if (previous) {
      const gap = Math.round(
        (new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate()).getTime() -
          new Date(
            previous.getFullYear(),
            previous.getMonth(),
            previous.getDate(),
          ).getTime()) /
          86_400_000,
      );
      current = gap === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    longestStreak = Math.max(longestStreak, current);
    previous = day.date;
  }

  // Shows by episode count. Rewatched episodes count: watching a series through
  // twice really is twice as much of that series.
  const showCounts = new Map<string, number>();
  for (const e of episodePlays) showCounts.set(e.title, (showCounts.get(e.title) ?? 0) + 1);
  const mostWatchedShow = [...showCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))[0] ?? null;

  // The film seen most often, which only means anything once something has been
  // seen twice.
  const rewatchCounts = new Map<number, { title: string; count: number }>();
  for (const play of plays) {
    if (play.mediaType !== "movie") continue;
    const entry = rewatchCounts.get(play.tmdbId) ?? { title: play.title, count: 0 };
    entry.count += 1;
    rewatchCounts.set(play.tmdbId, entry);
  }
  const topRewatch = [...rewatchCounts.values()].sort((a, b) => b.count - a.count)[0];
  const mostRewatched = topRewatch && topRewatch.count > 1 ? topRewatch : null;

  /**
   * The thumbs, folded by show.
   *
   * Read straight off `EpisodeRating` rather than derived from the play log:
   * a verdict is an opinion about an episode, not a viewing of it, and somebody
   * can perfectly well have rated an episode they watched years ago.
   */
  const verdicts = await db.episodeRating.findMany({
    where: { userId },
    select: { showId: true, liked: true },
  });

  const likedByShow = new Map<number, number>();
  let liked = 0;
  for (const verdict of verdicts) {
    if (!verdict.liked) continue;
    liked += 1;
    likedByShow.set(verdict.showId, (likedByShow.get(verdict.showId) ?? 0) + 1);
  }

  const topShow = [...likedByShow.entries()].sort((a, b) => b[1] - a[1])[0];
  // The show's name comes off the watched rows, which already carry it — a TMDB
  // lookup for a name we have written down would be a call for nothing.
  const showName = topShow
    ? (
        await db.watchedEpisode.findFirst({
          where: { userId, showId: topShow[0] },
          select: { showName: true },
        })
      )?.showName ?? null
    : null;

  const flavour = await tmdbFlavour(movies, episodes);

  return {
    ...flavour,
    mostRewatched,
    busiestWeekday:
      weekdayMinutes[busiestIndex] > 0
        ? { label: WEEKDAYS[busiestIndex], minutes: weekdayMinutes[busiestIndex] }
        : null,
    biggestDay,
    longestStreak,
    averageEpisode:
      episodePlays.length > 0
        ? Math.round(episodePlays.reduce((sum, e) => sum + e.runtime, 0) / episodePlays.length)
        : null,
    mostWatchedShow,
    // A "binge" being four or more episodes in one day.
    binges: days.filter((d) => d.items >= 4).length,
    firstLogged: days[0]?.date ?? null,
    episodeVerdicts:
      verdicts.length > 0
        ? {
            liked,
            disliked: verdicts.length - liked,
            favouriteShow:
              topShow && showName && topShow[1] > 1
                ? { name: showName, liked: topShow[1] }
                : null,
          }
        : null,
  };
}

type Flavour = Pick<FunStats, "topGenres" | "topActor" | "oldestMovie" | "topFranchise">;

/** The shape `tmdbFlavour` needs: one entry per distinct show that was watched. */
type WatchedShow = { showId: number };

const NO_FLAVOUR: Flavour = {
  topGenres: [],
  topActor: null,
  oldestMovie: null,
  topFranchise: null,
};

/**
 * The stats that need to know what a title *is* rather than when it was
 * watched: genre, cast, release year, franchise.
 *
 * Two sources, because neither is enough on its own. `TitleMeta` is the shared
 * cache the achievements fill in, and it covers the whole history — so the
 * oldest-film and franchise answers are drawn from everything logged, not just
 * the recent slice. Cast is cached nowhere, so it comes from a bounded fan-out
 * of full detail lookups, which carry release dates and franchises along with
 * them and so fill gaps the cache has not reached yet.
 */
async function tmdbFlavour(
  movies: { movieId: number; title: string }[],
  episodes: WatchedShow[],
): Promise<Flavour> {
  const movieIds = [...new Set(movies.map((m) => m.movieId))];
  const showIds = [...new Set(episodes.map((e) => e.showId))];
  if (movieIds.length === 0 && showIds.length === 0) return NO_FLAVOUR;

  const years = new Map<number, { title: string; year: number }>();
  const franchises = new Map<number, { name: string; films: Set<number> }>();
  // The logged title is what the user saw when they logged it, so it is what
  // they will recognise; TMDB's is only a fallback.
  const titles = new Map(movies.map((m) => [m.movieId, m.title]));

  function noteFilm(
    id: number,
    title: string,
    releaseDate: string | null,
    collection: { id: number; name: string } | null,
  ) {
    const year = Number(releaseDate?.slice(0, 4));
    if (Number.isFinite(year) && year > 1800) {
      years.set(id, { title: titles.get(id) ?? title, year });
    }
    if (collection) {
      const entry = franchises.get(collection.id) ?? {
        name: collection.name,
        films: new Set<number>(),
      };
      entry.films.add(id);
      franchises.set(collection.id, entry);
    }
  }

  const cached = await db.titleMeta
    .findMany({
      where: { mediaType: "movie", tmdbId: { in: movieIds } },
      select: {
        tmdbId: true,
        title: true,
        releaseDate: true,
        collectionId: true,
        collectionName: true,
      },
    })
    .catch(() => []);

  for (const row of cached) {
    noteFilm(
      row.tmdbId,
      row.title,
      row.releaseDate,
      row.collectionId ? { id: row.collectionId, name: row.collectionName ?? "Franchise" } : null,
    );
  }

  const genres = new Map<string, number>();
  const actors = new Map<number, { name: string; count: number }>();

  if (tmdbConfigured()) {
    // Capped at a couple of dozen titles a side: every lookup is cached, but
    // this still runs on a page render.
    const wanted = [
      ...showIds.slice(0, DETAIL_BUDGET).map((id) => ({ type: "tv" as const, id })),
      ...movieIds.slice(0, DETAIL_BUDGET).map((id) => ({ type: "movie" as const, id })),
    ];

    type Detail = Awaited<ReturnType<typeof getTv>> | Awaited<ReturnType<typeof getMovie>>;

    const details = await mapLimit(wanted, FANOUT, (item): Promise<Detail | null> =>
      item.type === "tv"
        ? getTv(item.id).catch(() => null)
        : getMovie(item.id).catch(() => null),
    );

    for (const [index, detail] of details.entries()) {
      if (!detail) continue;
      const item = wanted[index];

      for (const genre of detail.genres) {
        genres.set(genre.name, (genres.get(genre.name) ?? 0) + 1);
      }

      // One vote per title rather than per episode: a long-running show should
      // not hand its lead the crown on episode count alone.
      for (const member of detail.credits.cast.slice(0, CAST_DEPTH)) {
        const entry = actors.get(member.id) ?? { name: member.name, count: 0 };
        entry.count += 1;
        actors.set(member.id, entry);
      }

      if (item.type === "movie" && "release_date" in detail) {
        noteFilm(
          item.id,
          detail.title,
          detail.release_date || null,
          detail.belongs_to_collection ?? null,
        );
      }
    }
  }

  const oldest = [...years.entries()].sort((a, b) => a[1].year - b[1].year)[0];
  // One film is a film, not a franchise.
  const franchise = [...franchises.entries()]
    .filter(([, entry]) => entry.films.size >= 2)
    .sort((a, b) => b[1].films.size - a[1].films.size)[0];
  // Likewise, one appearance says nothing about who they keep watching.
  const actor = [...actors.entries()]
    .filter(([, entry]) => entry.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)[0];

  return {
    topGenres: [...genres.entries()]
      .sort((a, b) => b[1] - a[1])
      // Five, because the profile's genre panel draws a top five. Anything that
      // only wants the leader takes the first entry.
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    topActor: actor ? { id: actor[0], name: actor[1].name, count: actor[1].count } : null,
    oldestMovie: oldest ? { id: oldest[0], title: oldest[1].title, year: oldest[1].year } : null,
    topFranchise: franchise
      ? { id: franchise[0], name: franchise[1].name, count: franchise[1].films.size }
      : null,
  };
}
