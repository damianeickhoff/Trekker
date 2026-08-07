import { isBestPictureWinner, BEST_PICTURE_COUNT } from "./best-picture";
import { FRANCHISES, inFranchise } from "./franchises";
import type { Facts, Snapshot } from "./snapshot";

export type Category =
  | "Milestones"
  | "Habits"
  | "Seasons"
  | "Taste"
  | "Completion"
  | "Franchises"
  | "People";

/** Roughly how hard it is, which is all the badge colour means. */
export type Tier = "bronze" | "silver" | "gold" | "legend";

export const CATEGORIES: Category[] = [
  "Milestones",
  "Habits",
  "Seasons",
  "Taste",
  "Completion",
  "Franchises",
  "People",
];

export type Measured = {
  /** How far along, in whatever `unit` says. Capped against the target later. */
  progress: number;
  /** A line of context under the bar: which year, which franchise, and so on. */
  detail?: string;
};

/** One thing that counted towards an achievement. */
export type EvidenceItem = {
  key: string;
  /** Absent for evidence that is not a title — a friend, say. */
  mediaType?: "movie" | "tv";
  tmdbId?: number;
  title: string;
  /** TMDB poster path, where the evidence is a title. */
  poster?: string | null;
  /** Why this one counted: a genre, a year, a score, a date. */
  note?: string;
  at?: Date | null;
};

export type Evidence = {
  /** Names the list: "The films", "October 2025", "Your longest run". */
  caption: string;
  items: EvidenceItem[];
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  category: Category;
  tier: Tier;
  /** Key into the icon map in `src/components/achievement-badge.tsx`. */
  icon: string;
  /** What counts as done. */
  target: number;
  /** How the numbers read: a plain count, or minutes shown as hours. */
  unit?: "count" | "minutes";
  /** Progress is meaningless for these — you have it or you do not. */
  binary?: boolean;
  measure: (snapshot: Snapshot) => Measured;
  /**
   * What actually counted, for the achievement's own page.
   *
   * Deliberately separate from `measure` rather than folded into it: `measure`
   * runs for all thirty-odd achievements on every board render and wants to stay
   * a number, while this runs for exactly one of them and can afford to build a
   * list. They do have to agree, which is why both are written side by side.
   */
  evidence?: (snapshot: Snapshot) => Evidence;
};

// ---------------------------------------------------------------------------
// Small helpers shared by the measures below.
// ---------------------------------------------------------------------------

const MONTH = {
  january: 0,
  february: 1,
  july: 6,
  august: 7,
  october: 9,
  november: 10,
  december: 11,
} as const;

function hasGenre(facts: Facts | null | undefined, ...needles: string[]) {
  if (!facts) return false;
  return facts.genres.some((genre) =>
    needles.some((needle) => genre.toLowerCase().includes(needle.toLowerCase())),
  );
}

/** Every watched title as one row, films and shows together. */
function allTitles(snapshot: Snapshot) {
  const shows = [...snapshot.showFacts.entries()].map(([showId, facts]) => ({
    key: `tv-${showId}`,
    facts,
  }));
  const films = snapshot.movies.map((movie) => ({
    key: `movie-${movie.tmdbId}`,
    facts: movie.facts,
  }));
  return [...films, ...shows];
}

/**
 * The best single year for something counted per calendar year, with the year
 * itself for the caption. Yearly challenges are about one lap of the calendar,
 * so a total across five years must not stand in for it.
 */
function bestYear<T extends { watchedAt: Date }>(
  rows: T[],
  keep: (row: T) => boolean = () => true,
): { count: number; year: number | null } {
  const perYear = new Map<number, number>();
  for (const row of rows) {
    if (!keep(row)) continue;
    const year = row.watchedAt.getFullYear();
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }

  let best = { count: 0, year: null as number | null };
  for (const [year, count] of perYear) {
    if (count > best.count) best = { count, year };
  }
  return best;
}

/** Distinct titles, counted per calendar year, best year wins. */
function bestYearDistinct(
  rows: { watchedAt: Date; key: string }[],
): { count: number; year: number | null } {
  const perYear = new Map<number, Set<string>>();
  for (const row of rows) {
    const year = row.watchedAt.getFullYear();
    const set = perYear.get(year) ?? new Set<string>();
    set.add(row.key);
    perYear.set(year, set);
  }

  let best = { count: 0, year: null as number | null };
  for (const [year, set] of perYear) {
    if (set.size > best.count) best = { count: set.size, year };
  }
  return best;
}

function inYear(year: number | null) {
  return year === null ? undefined : `best so far: ${year}`;
}

function longestStreak(days: { date: Date }[]) {
  let longest = 0;
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
    longest = Math.max(longest, current);
    previous = day.date;
  }

  return longest;
}

/** Best Picture winners the user has seen, without double counting a remake. */
function bestPictureSeen(snapshot: Snapshot) {
  const seen = new Set<string>();
  for (const movie of snapshot.movies) {
    const title = movie.facts?.title ?? movie.title;
    if (isBestPictureWinner(title, movie.facts?.year ?? null)) seen.add(title.toLowerCase());
  }
  return seen.size;
}

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

// ---------------------------------------------------------------------------
// Evidence helpers.
// ---------------------------------------------------------------------------

const DAY = { day: "numeric", month: "short", year: "numeric" } as const;

function onDay(date: Date) {
  return date.toLocaleDateString("en-GB", DAY);
}

/** A watched film as a row in an evidence list. */
function filmItem(
  movie: Snapshot["movies"][number],
  note?: string,
): EvidenceItem {
  return {
    key: `movie-${movie.tmdbId}`,
    mediaType: "movie",
    tmdbId: movie.tmdbId,
    title: movie.facts?.title ?? movie.title,
    poster: movie.poster,
    note: note ?? onDay(movie.watchedAt),
    at: movie.watchedAt,
  };
}

/** One viewing as a row, naming the episode where there is one. */
function playItem(play: Snapshot["plays"][number], note?: string): EvidenceItem {
  const episode =
    play.seasonNumber !== null && play.episodeNumber !== null
      ? `S${String(play.seasonNumber).padStart(2, "0")}E${String(play.episodeNumber).padStart(2, "0")}`
      : null;

  return {
    key: `play-${play.mediaType}-${play.tmdbId}-${play.seasonNumber ?? ""}-${
      play.episodeNumber ?? ""
    }-${play.watchedAt.getTime()}`,
    mediaType: play.mediaType === "tv" ? "tv" : "movie",
    tmdbId: play.tmdbId,
    title: play.title,
    poster: play.poster,
    note: note ?? [episode, onDay(play.watchedAt)].filter(Boolean).join(" · "),
    at: play.watchedAt,
  };
}

/**
 * Show id → its poster.
 *
 * Shows have no row of their own the way films do — they exist as a pile of
 * episodes — so the artwork has to be picked off one of those.
 */
function showPosters(snapshot: Snapshot) {
  const posters = new Map<number, string | null>();
  for (const episode of snapshot.episodes) {
    if (!posters.has(episode.showId)) posters.set(episode.showId, episode.showPoster);
  }
  return posters;
}

/** A whole show as one row, rather than an episode of it. */
function showItem(
  showId: number,
  title: string,
  posters: Map<number, string | null>,
  note?: string,
  at?: Date | null,
): EvidenceItem {
  return {
    key: `tv-${showId}`,
    mediaType: "tv",
    tmdbId: showId,
    title,
    poster: posters.get(showId) ?? null,
    note,
    at,
  };
}

/** Newest first, and never more than a screenful. */
function newestFirst(items: EvidenceItem[], limit = 60) {
  return items
    .slice()
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, limit);
}

/** Films matching a test, newest first. */
function films(
  snapshot: Snapshot,
  keep: (movie: Snapshot["movies"][number]) => boolean,
  note?: (movie: Snapshot["movies"][number]) => string | undefined,
) {
  return newestFirst(
    snapshot.movies.filter(keep).map((movie) => filmItem(movie, note?.(movie))),
  );
}

/** Viewings matching a test, newest first. */
function plays(
  snapshot: Snapshot,
  keep: (play: Snapshot["plays"][number]) => boolean,
  note?: (play: Snapshot["plays"][number]) => string | undefined,
) {
  return newestFirst(
    snapshot.plays.filter(keep).map((play) => playItem(play, note?.(play))),
  );
}

/** Everything watched on a given local day. */
function playsOnDay(snapshot: Snapshot, date: Date) {
  const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return snapshot.plays.filter(
    (play) =>
      `${play.watchedAt.getFullYear()}-${play.watchedAt.getMonth()}-${play.watchedAt.getDate()}` ===
      key,
  );
}

/**
 * Where the hours actually went, biggest first.
 *
 * A list of every viewing would be thousands of rows and say nothing; totalling
 * per title answers the question the badge raises — "a hundred hours of *what*?"
 */
function longestSittings(snapshot: Snapshot): Evidence {
  const totals = new Map<
    string,
    { title: string; poster: string | null; mediaType: "movie" | "tv"; tmdbId: number; minutes: number }
  >();

  for (const play of snapshot.plays) {
    const mediaType = play.mediaType === "tv" ? ("tv" as const) : ("movie" as const);
    const key = `${mediaType}-${play.tmdbId}`;
    const entry = totals.get(key) ?? { title: play.title, poster: play.poster, mediaType, tmdbId: play.tmdbId, minutes: 0 };
    entry.minutes += play.runtime;
    totals.set(key, entry);
  }

  const ranked = [...totals.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 60);

  return {
    caption: `${Math.round(snapshot.totalMinutes / 60).toLocaleString("en-GB")} hours, and where they went`,
    items: ranked.map(([key, entry]) => ({
      key,
      mediaType: entry.mediaType,
      tmdbId: entry.tmdbId,
      title: entry.title,
      poster: entry.poster,
      note: `${Math.round(entry.minutes / 60)}h`,
      at: null,
    })),
  };
}

/** The days of the longest run, and what was watched on each. */
function streakEvidence(snapshot: Snapshot): Evidence {
  const run = streakDays(snapshot.days);
  if (run.length === 0) return { caption: "Nothing yet", items: [] };

  const items: EvidenceItem[] = [];
  for (const date of run) {
    for (const play of playsOnDay(snapshot, date)) items.push(playItem(play));
  }

  return {
    caption: `${run.length} days running, ${onDay(run[0])} to ${onDay(run[run.length - 1])}`,
    items: items.slice(0, 120),
  };
}

/** The day with the most films in it. */
function bestFilmDay(snapshot: Snapshot): Evidence {
  const best = snapshot.days.reduce<(typeof snapshot.days)[number] | null>(
    (winner, day) => (!winner || day.movies > winner.movies ? day : winner),
    null,
  );
  if (!best || best.movies === 0) return { caption: "No film days yet", items: [] };

  return {
    caption: `${best.movies} films on ${onDay(best.date)}`,
    items: playsOnDay(snapshot, best.date)
      .filter((play) => play.mediaType === "movie")
      .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())
      .map((play) => playItem(play))
      .slice(0, 100),
  };
}

/** Franchises, most complete first, each showing how far along it is. */
function franchiseProgress(snapshot: Snapshot): Evidence {
  return {
    caption: snapshot.franchises.length > 0 ? "Your franchises" : "No franchises yet",
    items: snapshot.franchises.map((franchise) => ({
      key: `collection-${franchise.id}`,
      title: franchise.name,
      note:
        franchise.owned >= franchise.total
          ? `complete · ${franchise.total} films`
          : `${franchise.owned} of ${franchise.total}`,
    })),
  };
}

/**
 * Shows watched to the end of a finished run.
 *
 * Narrowed by `showStates`, which is only populated on the full pass — the
 * offline unlock check cannot ask TMDB what "finished" means. That is fine: this
 * only ever runs for the detail page, which always builds the full snapshot.
 */
function finishedShows(snapshot: Snapshot): Evidence {
  const posters = showPosters(snapshot);
  const shows = new Map<number, { name: string; at: Date; episodes: number }>();
  for (const episode of snapshot.episodes) {
    if (snapshot.showStates.get(episode.showId) !== "completed") continue;

    const seen = shows.get(episode.showId) ?? {
      name: episode.showName,
      at: episode.watchedAt,
      episodes: 0,
    };
    seen.episodes += 1;
    if (episode.watchedAt > seen.at) seen.at = episode.watchedAt;
    shows.set(episode.showId, seen);
  }

  return {
    caption: `${shows.size} watched to the end`,
    items: newestFirst(
      [...shows.entries()].map(([showId, show]) => ({
        key: `tv-${showId}`,
        mediaType: "tv" as const,
        tmdbId: showId,
        title: show.name,
        poster: posters.get(showId) ?? null,
        note: `${show.episodes} episode${show.episodes === 1 ? "" : "s"}`,
        at: show.at,
      })),
    ),
  };
}

/** Best Picture winners already seen. */
function bestPictureEvidence(snapshot: Snapshot): Evidence {
  const winners = snapshot.movies.filter((movie) =>
    isBestPictureWinner(movie.facts?.title ?? movie.title, movie.facts?.year ?? null),
  );

  return {
    caption: `${bestPictureSeen(snapshot)} of ${BEST_PICTURE_COUNT} Best Picture winners`,
    items: newestFirst(
      winners.map((movie) => filmItem(movie, movie.facts?.year ? String(movie.facts.year) : undefined)),
    ),
  };
}

/** The run of consecutive days that made the streak, longest first. */
function streakDays(days: { date: Date }[]): Date[] {
  let best: Date[] = [];
  let run: Date[] = [];
  let previous: Date | null = null;

  for (const day of days) {
    const gap = previous
      ? Math.round(
          (new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate()).getTime() -
            new Date(
              previous.getFullYear(),
              previous.getMonth(),
              previous.getDate(),
            ).getTime()) /
            86_400_000,
        )
      : 0;

    run = previous && gap === 1 ? [...run, day.date] : [day.date];
    if (run.length > best.length) best = run;
    previous = day.date;
  }

  return best;
}

// ---------------------------------------------------------------------------
// The catalogue.
// ---------------------------------------------------------------------------

export const ACHIEVEMENTS: Achievement[] = [
  // -- Milestones ----------------------------------------------------------
  {
    id: "first-contact",
    name: "First Contact",
    description: "Log the very first thing you watch.",
    category: "Milestones",
    tier: "bronze",
    icon: "sparkles",
    target: 1,
    binary: true,
    measure: (s) => ({
      progress: s.days.length > 0 ? 1 : 0,
      detail: s.days[0]
        ? `since ${s.days[0].date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}`
        : undefined,
    }),
    evidence: (s) => {
      const first = [...s.plays].sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())[0];
      return {
        caption: "Where it all started",
        items: first ? [playItem(first)] : [],
      };
    },
  },
  {
    id: "century-club",
    name: "Century Club",
    description: "Watch 100 films, all told.",
    category: "Milestones",
    tier: "silver",
    icon: "film",
    target: 100,
    measure: (s) => ({ progress: s.movies.length }),
    evidence: (s) => ({
      caption: `Every film you have logged (${s.movies.length})`,
      items: films(s, () => true),
    }),
  },
  {
    id: "hundred-in-a-year",
    name: "The Hundred",
    description: "Watch 100 films inside a single calendar year.",
    category: "Milestones",
    tier: "gold",
    icon: "calendar-check",
    target: 100,
    measure: (s) => {
      const best = bestYear(s.movies);
      return { progress: best.count, detail: inYear(best.year) };
    },
    evidence: (s) => {
      const year = bestYear(s.movies).year;
      return {
        caption: year ? `Films watched in ${year}` : "Films",
        items: films(s, (m) => year !== null && m.watchedAt.getFullYear() === year),
      };
    },
  },
  {
    id: "remote-control",
    name: "Remote Control",
    description: "Watch 1,000 episodes of television.",
    category: "Milestones",
    tier: "gold",
    icon: "tv",
    target: 1000,
    // A thousand episodes *watched*, which is a claim about volume rather than
    // about variety — so a series worth going through twice counts twice.
    measure: (s) => ({ progress: s.playCounts.episodes }),
    evidence: (s) => ({
      caption: `${s.playCounts.episodes.toLocaleString("en-GB")} episodes — the most recent`,
      items: plays(s, (p) => p.mediaType === "tv"),
    }),
  },
  {
    id: "channel-surfer",
    name: "Channel Surfer",
    description: "Start 50 different shows.",
    category: "Milestones",
    tier: "silver",
    icon: "monitor-play",
    target: 50,
    measure: (s) => ({ progress: new Set(s.episodes.map((e) => e.showId)).size }),
    evidence: (s) => {
      // One row per show, dated by the first episode of it that was watched.
      const posters = showPosters(s);
      const started = new Map<number, { name: string; at: Date }>();
      for (const episode of s.episodes) {
        const seen = started.get(episode.showId);
        if (!seen || episode.watchedAt < seen.at) {
          started.set(episode.showId, { name: episode.showName, at: episode.watchedAt });
        }
      }

      return {
        caption: `${started.size} shows started`,
        items: newestFirst(
          [...started.entries()].map(([showId, show]) => ({
            key: `tv-${showId}`,
            mediaType: "tv" as const,
            tmdbId: showId,
            title: show.name,
            poster: posters.get(showId) ?? null,
            note: `started ${onDay(show.at)}`,
            at: show.at,
          })),
        ),
      };
    },
  },
  {
    id: "lost-weekend",
    name: "Lost Weekend",
    description: "Spend 100 hours in front of something.",
    category: "Milestones",
    tier: "bronze",
    icon: "hourglass",
    target: 100 * 60,
    unit: "minutes",
    measure: (s) => ({ progress: s.totalMinutes }),
    evidence: longestSittings,
  },
  {
    id: "long-haul",
    name: "The Long Haul",
    description: "Spend 1,000 hours in front of something.",
    category: "Milestones",
    tier: "legend",
    icon: "hourglass",
    target: 1000 * 60,
    unit: "minutes",
    measure: (s) => ({ progress: s.totalMinutes }),
    evidence: longestSittings,
  },

  // -- Habits --------------------------------------------------------------
  {
    id: "seven-nights",
    name: "Seven Nights",
    description: "Log something seven days running.",
    category: "Habits",
    tier: "bronze",
    icon: "flame",
    target: 7,
    measure: (s) => ({ progress: longestStreak(s.days) }),
    evidence: streakEvidence,
  },
  {
    id: "iron-eyes",
    name: "Iron Eyes",
    description: "Log something thirty days running.",
    category: "Habits",
    tier: "gold",
    icon: "flame",
    target: 30,
    measure: (s) => {
      const streak = longestStreak(s.days);
      return { progress: streak, detail: `longest run: ${streak} day${streak === 1 ? "" : "s"}` };
    },
    evidence: streakEvidence,
  },
  {
    id: "double-feature",
    name: "Double Feature",
    description: "Watch two films in one day.",
    category: "Habits",
    tier: "bronze",
    icon: "clapperboard",
    target: 2,
    measure: (s) => ({ progress: Math.max(0, ...s.days.map((d) => d.movies)) }),
    evidence: bestFilmDay,
  },
  {
    id: "triple-bill",
    name: "Triple Bill",
    description: "Watch three films in one day.",
    category: "Habits",
    tier: "silver",
    icon: "clapperboard",
    target: 3,
    measure: (s) => ({ progress: Math.max(0, ...s.days.map((d) => d.movies)) }),
    evidence: bestFilmDay,
  },
  {
    id: "just-one-more",
    name: "Just One More",
    description: "Watch ten episodes of the same show in a single day.",
    category: "Habits",
    tier: "silver",
    icon: "layers",
    target: 10,
    measure: (s) => {
      let best = 0;
      let show = "";
      for (const day of s.days) {
        for (const [showId, count] of day.episodesPerShow) {
          if (count <= best) continue;
          best = count;
          show = s.episodes.find((e) => e.showId === showId)?.showName ?? "";
        }
      }
      return { progress: best, detail: show ? `best run: ${show}` : undefined };
    },
    evidence: (s) => {
      // The single day and show with the longest run in it.
      let best: { date: Date; showId: number; count: number } | null = null;
      for (const day of s.days) {
        for (const [showId, count] of day.episodesPerShow) {
          if (!best || count > best.count) best = { date: day.date, showId, count };
        }
      }

      if (!best) return { caption: "Nothing yet", items: [] };

      const day = best;
      return {
        caption: `${day.count} episodes on ${onDay(day.date)}`,
        items: playsOnDay(s, day.date)
          .filter((play) => play.mediaType === "tv" && play.tmdbId === day.showId)
          .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())
          .map((play) => playItem(play))
          .slice(0, 100),
      };
    },
  },
  {
    id: "night-owl",
    name: "Night Owl",
    description: "Log something between two and five in the morning.",
    category: "Habits",
    tier: "bronze",
    icon: "moon",
    target: 1,
    binary: true,
    measure: (s) => {
      // You were up at three in the morning. Whether you had seen it before is
      // beside the point.
      const late = s.plays.some((play) => {
        const hour = play.watchedAt.getHours();
        return hour >= 2 && hour < 5;
      });
      return { progress: late ? 1 : 0 };
    },
    evidence: (s) => ({
      caption: "Watched between two and five in the morning",
      items: plays(
        s,
        (p) => p.watchedAt.getHours() >= 2 && p.watchedAt.getHours() < 5,
        (p) =>
          `${p.watchedAt.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })} · ${onDay(p.watchedAt)}`,
      ),
    }),
  },
  {
    id: "marathon-day",
    name: "Marathon",
    description: "Put eight hours away in a single day.",
    category: "Habits",
    tier: "gold",
    icon: "timer",
    target: 8 * 60,
    unit: "minutes",
    measure: (s) => ({ progress: Math.max(0, ...s.days.map((d) => d.minutes)) }),
    evidence: (s) => {
      const biggest = s.days.reduce<(typeof s.days)[number] | null>(
        (best, day) => (!best || day.minutes > best.minutes ? day : best),
        null,
      );
      if (!biggest) return { caption: "Nothing yet", items: [] };

      return {
        caption: `${Math.round(biggest.minutes / 60)} hours on ${onDay(biggest.date)}`,
        items: playsOnDay(s, biggest.date)
          .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())
          .map((play) => playItem(play))
          .slice(0, 100),
      };
    },
  },

  // -- Seasons -------------------------------------------------------------
  {
    id: "horror-october",
    name: "Season of the Witch",
    description: "Watch thirteen horror films during one October.",
    category: "Seasons",
    tier: "gold",
    icon: "ghost",
    target: 13,
    measure: (s) => {
      const best = bestYear(
        s.movies,
        (m) => m.watchedAt.getMonth() === MONTH.october && hasGenre(m.facts, "horror"),
      );
      return { progress: best.count, detail: inYear(best.year) };
    },
    evidence: (s) => {
      const year = bestYear(
        s.movies,
        (m) => m.watchedAt.getMonth() === MONTH.october && hasGenre(m.facts, "horror"),
      ).year;

      return {
        caption: year ? `Horror in October ${year}` : "Horror in October",
        items: films(
          s,
          (m) =>
            year !== null &&
            m.watchedAt.getFullYear() === year &&
            m.watchedAt.getMonth() === MONTH.october &&
            hasGenre(m.facts, "horror"),
        ),
      };
    },
  },
  {
    id: "all-hallows-eve",
    name: "All Hallows' Eve",
    description: "Watch a horror film on the 31st of October.",
    category: "Seasons",
    tier: "silver",
    icon: "ghost",
    target: 1,
    binary: true,
    measure: (s) => {
      const found = s.movies.some(
        (m) =>
          m.watchedAt.getMonth() === MONTH.october &&
          m.watchedAt.getDate() === 31 &&
          hasGenre(m.facts, "horror"),
      );
      return { progress: found ? 1 : 0 };
    },
    evidence: (s) => ({
      caption: "Horror on Halloween itself",
      items: films(
        s,
        (m) =>
          m.watchedAt.getMonth() === MONTH.october &&
          m.watchedAt.getDate() === 31 &&
          hasGenre(m.facts, "horror"),
      ),
    }),
  },
  {
    id: "scifi-month",
    name: "Sci-Fi Month",
    description: "Watch five science fiction titles during one November.",
    category: "Seasons",
    tier: "silver",
    icon: "rocket",
    target: 5,
    measure: (s) => {
      const films = s.movies
        .filter(
          (m) =>
            m.watchedAt.getMonth() === MONTH.november &&
            hasGenre(m.facts, "science fiction", "sci-fi"),
        )
        .map((m) => ({ watchedAt: m.watchedAt, key: `movie-${m.tmdbId}` }));

      const shows = s.episodes
        .filter(
          (e) =>
            e.watchedAt.getMonth() === MONTH.november &&
            hasGenre(s.showFacts.get(e.showId), "science fiction", "sci-fi"),
        )
        .map((e) => ({ watchedAt: e.watchedAt, key: `tv-${e.showId}` }));

      const best = bestYearDistinct([...films, ...shows]);
      return { progress: best.count, detail: inYear(best.year) };
    },
    evidence: (s) => {
      const posters = showPosters(s);
      const isScifiFilm = (m: Snapshot["movies"][number]) =>
        m.watchedAt.getMonth() === MONTH.november &&
        hasGenre(m.facts, "science fiction", "sci-fi");
      const isScifiEpisode = (e: Snapshot["episodes"][number]) =>
        e.watchedAt.getMonth() === MONTH.november &&
        hasGenre(s.showFacts.get(e.showId), "science fiction", "sci-fi");

      const year = bestYearDistinct([
        ...s.movies.filter(isScifiFilm).map((m) => ({ watchedAt: m.watchedAt, key: `movie-${m.tmdbId}` })),
        ...s.episodes.filter(isScifiEpisode).map((e) => ({ watchedAt: e.watchedAt, key: `tv-${e.showId}` })),
      ]).year;

      // Counted per distinct title, so the list is too — a show binged through
      // one November is one entry here, exactly as it is one towards the target.
      const shows = new Map<number, Date>();
      for (const episode of s.episodes) {
        if (!isScifiEpisode(episode) || episode.watchedAt.getFullYear() !== year) continue;
        const seen = shows.get(episode.showId);
        if (!seen || episode.watchedAt < seen) shows.set(episode.showId, episode.watchedAt);
      }

      return {
        caption: year ? `Science fiction in November ${year}` : "Science fiction in November",
        items: newestFirst([
          ...s.movies
            .filter((m) => isScifiFilm(m) && m.watchedAt.getFullYear() === year)
            .map((m) => filmItem(m)),
          ...[...shows.entries()].map(([showId, at]) => ({
            key: `tv-${showId}`,
            mediaType: "tv" as const,
            tmdbId: showId,
            title: s.showFacts.get(showId)?.title ?? "Show",
            poster: posters.get(showId) ?? null,
            note: onDay(at),
            at,
          })),
        ]),
      };
    },
  },
  {
    id: "yule-log",
    name: "Yule Log",
    description: "Watch three films over Christmas, the 24th to the 26th.",
    category: "Seasons",
    tier: "bronze",
    icon: "gift",
    target: 3,
    measure: (s) => {
      const best = bestYear(
        s.movies,
        (m) =>
          m.watchedAt.getMonth() === MONTH.december &&
          m.watchedAt.getDate() >= 24 &&
          m.watchedAt.getDate() <= 26,
      );
      return { progress: best.count, detail: inYear(best.year) };
    },
    evidence: (s) => {
      const overChristmas = (m: Snapshot["movies"][number]) =>
        m.watchedAt.getMonth() === MONTH.december &&
        m.watchedAt.getDate() >= 24 &&
        m.watchedAt.getDate() <= 26;
      const year = bestYear(s.movies, overChristmas).year;

      return {
        caption: year ? `Christmas ${year}` : "Christmas viewing",
        items: films(s, (m) => overChristmas(m) && m.watchedAt.getFullYear() === year),
      };
    },
  },
  {
    id: "love-actually",
    name: "Love Actually",
    description: "Watch a romance in February.",
    category: "Seasons",
    tier: "bronze",
    icon: "heart",
    target: 1,
    binary: true,
    measure: (s) => {
      const found = s.movies.some(
        (m) => m.watchedAt.getMonth() === MONTH.february && hasGenre(m.facts, "romance"),
      );
      return { progress: found ? 1 : 0 };
    },
    evidence: (s) => ({
      caption: "Romance in February",
      items: films(
        s,
        (m) => m.watchedAt.getMonth() === MONTH.february && hasGenre(m.facts, "romance"),
      ),
    }),
  },
  {
    id: "new-years-resolution",
    name: "Resolution",
    description: "Log something on the first of January.",
    category: "Seasons",
    tier: "bronze",
    icon: "party-popper",
    target: 1,
    binary: true,
    measure: (s) => {
      const found = s.plays.some(
        (play) => play.watchedAt.getMonth() === MONTH.january && play.watchedAt.getDate() === 1,
      );
      return { progress: found ? 1 : 0 };
    },
    evidence: (s) => ({
      caption: "New Year's Day",
      items: plays(
        s,
        (p) => p.watchedAt.getMonth() === MONTH.january && p.watchedAt.getDate() === 1,
      ),
    }),
  },
  {
    id: "blockbuster-summer",
    name: "Blockbuster Summer",
    description: "Watch ten films across one July and August.",
    category: "Seasons",
    tier: "silver",
    icon: "sun",
    target: 10,
    measure: (s) => {
      const best = bestYear(
        s.movies,
        (m) => m.watchedAt.getMonth() === MONTH.july || m.watchedAt.getMonth() === MONTH.august,
      );
      return { progress: best.count, detail: inYear(best.year) };
    },
    evidence: (s) => {
      const inSummer = (m: Snapshot["movies"][number]) =>
        m.watchedAt.getMonth() === MONTH.july || m.watchedAt.getMonth() === MONTH.august;
      const year = bestYear(s.movies, inSummer).year;

      return {
        caption: year ? `Summer ${year}` : "Summer films",
        items: films(s, (m) => inSummer(m) && m.watchedAt.getFullYear() === year),
      };
    },
  },

  // -- Taste ---------------------------------------------------------------
  {
    id: "omnivore",
    name: "Omnivore",
    description: "Watch something from twelve different genres.",
    category: "Taste",
    tier: "silver",
    icon: "shapes",
    target: 12,
    measure: (s) => {
      const genres = new Set<string>();
      for (const title of allTitles(s)) {
        for (const genre of title.facts?.genres ?? []) genres.add(genre);
      }
      return { progress: genres.size, detail: `${genres.size} so far` };
    },
    evidence: (s) => {
      // One title per genre — whatever opened each one, oldest wins.
      const posters = showPosters(s);
      const firstIn = new Map<string, EvidenceItem>();

      for (const movie of [...s.movies].sort(
        (a, b) => a.watchedAt.getTime() - b.watchedAt.getTime(),
      )) {
        for (const genre of movie.facts?.genres ?? []) {
          if (!firstIn.has(genre)) firstIn.set(genre, filmItem(movie, genre));
        }
      }

      for (const [showId, facts] of s.showFacts) {
        for (const genre of facts.genres) {
          if (firstIn.has(genre)) continue;
          firstIn.set(genre, {
            key: `tv-${showId}-${genre}`,
            mediaType: "tv",
            tmdbId: showId,
            title: facts.title,
            poster: posters.get(showId) ?? null,
            note: genre,
          });
        }
      }

      return {
        caption: `${firstIn.size} genres, and what opened each`,
        items: [...firstIn.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, item]) => item),
      };
    },
  },
  {
    id: "subtitle-enjoyer",
    name: "Subtitle Enjoyer",
    description: "Watch ten titles that were not made in English.",
    category: "Taste",
    tier: "silver",
    icon: "languages",
    target: 10,
    measure: (s) => {
      const foreign = allTitles(s).filter(
        (t) => t.facts?.originalLanguage && t.facts.originalLanguage !== "en",
      );
      const languages = new Set(foreign.map((t) => t.facts!.originalLanguage));
      return {
        progress: foreign.length,
        detail: languages.size > 0 ? `${languages.size} language${languages.size === 1 ? "" : "s"}` : undefined,
      };
    },
    evidence: (s) => {
      const posters = showPosters(s);

      return {
        caption: "Not made in English",
        items: newestFirst([
          ...s.movies
            .filter((m) => m.facts?.originalLanguage && m.facts.originalLanguage !== "en")
            .map((m) => filmItem(m, m.facts!.originalLanguage!.toUpperCase())),
          ...[...s.showFacts.entries()]
            .filter(([, facts]) => facts.originalLanguage && facts.originalLanguage !== "en")
            .map(([showId, facts]) =>
              showItem(showId, facts.title, posters, facts.originalLanguage!.toUpperCase()),
            ),
        ]),
      };
    },
  },
  {
    id: "silver-screen",
    name: "Silver Screen",
    description: "Watch ten films made before 1970.",
    category: "Taste",
    tier: "silver",
    icon: "camera",
    target: 10,
    measure: (s) => ({
      progress: s.movies.filter((m) => m.facts?.year && m.facts.year < 1970).length,
    }),
    evidence: (s) => ({
      caption: "Made before 1970",
      items: films(
        s,
        (m) => Boolean(m.facts?.year && m.facts.year < 1970),
        (m) => String(m.facts?.year ?? ""),
      ),
    }),
  },
  {
    id: "time-capsule",
    name: "Time Capsule",
    description: "Watch a film from every decade since the 1950s.",
    category: "Taste",
    tier: "gold",
    icon: "history",
    target: DECADES.length,
    measure: (s) => {
      const covered = new Set<number>();
      for (const movie of s.movies) {
        const year = movie.facts?.year;
        if (!year) continue;
        const decade = Math.floor(year / 10) * 10;
        if (DECADES.includes(decade)) covered.add(decade);
      }
      const missing = DECADES.filter((d) => !covered.has(d));
      return {
        progress: covered.size,
        detail: missing.length > 0 && missing.length <= 3
          ? `still need the ${missing.map((d) => `${d}s`).join(", ")}`
          : undefined,
      };
    },
    evidence: (s) => {
      // One film per decade, oldest release first — the shape of the collection
      // is the point, so the gaps should be as visible as the entries.
      const perDecade = new Map<number, EvidenceItem>();
      for (const movie of s.movies) {
        const year = movie.facts?.year;
        if (!year) continue;
        const decade = Math.floor(year / 10) * 10;
        if (!DECADES.includes(decade) || perDecade.has(decade)) continue;
        perDecade.set(decade, filmItem(movie, `${decade}s · ${year}`));
      }

      return {
        caption: `${perDecade.size} of ${DECADES.length} decades covered`,
        items: DECADES.map((decade) => perDecade.get(decade)).filter(
          (item): item is EvidenceItem => item !== undefined,
        ),
      };
    },
  },
  {
    id: "epic",
    name: "Epic",
    description: "Sit through a film over three hours long.",
    category: "Taste",
    tier: "bronze",
    icon: "ruler",
    target: 1,
    binary: true,
    measure: (s) => {
      const longest = s.movies.reduce<{ title: string; runtime: number } | null>(
        (best, movie) => {
          const runtime = Math.max(movie.runtime, movie.facts?.runtime ?? 0);
          return best === null || runtime > best.runtime ? { title: movie.title, runtime } : best;
        },
        null,
      );
      return {
        progress: longest && longest.runtime >= 180 ? 1 : 0,
        detail: longest && longest.runtime > 0 ? `longest: ${longest.title} (${longest.runtime}m)` : undefined,
      };
    },
    evidence: (s) => ({
      caption: "Three hours or more",
      items: films(
        s,
        (m) => Math.max(m.runtime, m.facts?.runtime ?? 0) >= 180,
        (m) => `${Math.max(m.runtime, m.facts?.runtime ?? 0)}m`,
      ),
    }),
  },
  {
    id: "critics-darling",
    name: "Critic's Darling",
    description: "Watch twenty-five films the audience scores 80 or better.",
    category: "Taste",
    tier: "silver",
    icon: "star",
    target: 25,
    measure: (s) => ({
      progress: s.movies.filter((m) => (m.score ?? 0) >= 80).length,
    }),
    evidence: (s) => ({
      caption: "Scored 80 or better by the audience",
      items: films(s, (m) => (m.score ?? 0) >= 80, (m) => `${m.score}%`),
    }),
  },

  // -- Completion ----------------------------------------------------------
  {
    id: "completionist",
    name: "Completionist",
    description: "Watch every film in a franchise.",
    category: "Completion",
    tier: "gold",
    icon: "boxes",
    target: 1,
    measure: (s) => {
      const done = s.franchises.filter((f) => f.owned >= f.total);
      const closest = s.franchises[0];
      return {
        progress: done.length > 0 ? 1 : 0,
        detail: done.length > 0
          ? done.map((f) => f.name).slice(0, 2).join(", ")
          : closest
            ? `closest: ${closest.name} (${closest.owned}/${closest.total})`
            : undefined,
      };
    },
    evidence: franchiseProgress,
  },
  {
    id: "cinematic-universe",
    name: "Cinematic Universe",
    description: "Finish three franchises end to end.",
    category: "Completion",
    tier: "legend",
    icon: "boxes",
    target: 3,
    measure: (s) => {
      const done = s.franchises.filter((f) => f.owned >= f.total);
      return {
        progress: done.length,
        detail: done.length > 0 ? done.map((f) => f.name).slice(0, 3).join(", ") : undefined,
      };
    },
    evidence: franchiseProgress,
  },
  {
    id: "the-end",
    name: "The End",
    description: "Watch a finished show all the way through.",
    category: "Completion",
    tier: "bronze",
    icon: "check-check",
    target: 1,
    measure: (s) => ({ progress: s.finishedShows }),
    evidence: finishedShows,
  },
  {
    id: "serial-finisher",
    name: "Serial Finisher",
    description: "Watch ten shows all the way through.",
    category: "Completion",
    tier: "gold",
    icon: "check-check",
    target: 10,
    measure: (s) => ({ progress: s.finishedShows }),
    evidence: finishedShows,
  },
  {
    id: "oscar-challenge",
    name: "Oscar Challenge",
    description: "Watch ten films that won Best Picture.",
    category: "Completion",
    tier: "silver",
    icon: "award",
    target: 10,
    measure: (s) => ({ progress: bestPictureSeen(s) }),
    evidence: bestPictureEvidence,
  },
  {
    id: "and-the-award-goes-to",
    name: "And the Award Goes To",
    description: "Watch every film that has ever won Best Picture.",
    category: "Completion",
    tier: "legend",
    icon: "award",
    target: BEST_PICTURE_COUNT,
    measure: (s) => {
      const seen = bestPictureSeen(s);
      return { progress: seen, detail: `${BEST_PICTURE_COUNT - seen} left to find` };
    },
    evidence: bestPictureEvidence,
  },

  // -- People --------------------------------------------------------------
  {
    id: "everyones-a-critic",
    name: "Everyone's a Critic",
    description: "Score a hundred titles.",
    category: "People",
    tier: "silver",
    icon: "gauge",
    target: 100,
    measure: (s) => ({ progress: s.ratings.length }),
    evidence: (s) => ({
      caption: `${s.ratingRows.length} scored`,
      items: [...s.ratingRows]
        .sort((a, b) => b.score - a.score)
        .slice(0, 60)
        .map((rating) => ({
          key: `rating-${rating.mediaType}-${rating.tmdbId}`,
          mediaType: rating.mediaType === "tv" ? ("tv" as const) : ("movie" as const),
          tmdbId: rating.tmdbId,
          title: rating.title,
          poster: rating.poster,
          note: `${rating.score}%`,
        })),
    }),
  },
  {
    id: "wordsmith",
    name: "Wordsmith",
    description: "Write twenty-five reviews.",
    category: "People",
    tier: "gold",
    icon: "pen-line",
    target: 25,
    measure: (s) => ({
      progress: s.ratings.filter((r) => (r.review ?? "").trim().length > 0).length,
    }),
    evidence: (s) => ({
      caption: "Everything you wrote about",
      items: s.ratingRows
        .filter((rating) => (rating.review ?? "").trim().length > 0)
        .slice(0, 60)
        .map((rating) => ({
          key: `review-${rating.mediaType}-${rating.tmdbId}`,
          mediaType: rating.mediaType === "tv" ? ("tv" as const) : ("movie" as const),
          tmdbId: rating.tmdbId,
          title: rating.title,
          poster: rating.poster,
          note: (rating.review ?? "").trim(),
        })),
    }),
  },
  {
    id: "big-plans",
    name: "Big Plans",
    description: "Have fifty things waiting on your watchlist.",
    category: "People",
    tier: "bronze",
    icon: "bookmark",
    target: 50,
    measure: (s) => ({ progress: s.watchlistCount }),
    evidence: (s) => ({
      caption: `${s.watchlistCount} waiting`,
      items: s.watchlist.slice(0, 60).map((item) => ({
        key: `watchlist-${item.mediaType}-${item.tmdbId}`,
        mediaType: item.mediaType === "tv" ? ("tv" as const) : ("movie" as const),
        tmdbId: item.tmdbId,
        title: item.title,
        poster: item.poster,
      })),
    }),
  },
  {
    id: "movie-club",
    name: "Movie Club",
    description: "Have five friends on Trekker.",
    category: "People",
    tier: "silver",
    icon: "users",
    target: 5,
    measure: (s) => ({ progress: s.friendCount }),
    // The only evidence that is not a title. The list still works — it is just
    // people rather than posters, which the detail page renders accordingly.
    evidence: (s) => ({
      caption: `${s.friendCount} on Trekker with you`,
      items: s.friends.map((friend) => ({
        key: `friend-${friend.id}`,
        title: friend.name,
      })),
    }),
  },

  // -- Franchises ----------------------------------------------------------
  // One per named series, generated from the list in `franchises.ts` rather
  // than written out here: every one of them is the same achievement with a
  // different set of films behind it.
  ...FRANCHISES.map((franchise): Achievement => {
    const owned = (s: Snapshot) =>
      s.movies.filter((movie) =>
        inFranchise(franchise, {
          tmdbId: movie.tmdbId,
          collectionId: movie.facts?.collectionId,
        }),
      );

    return {
      id: `franchise-${franchise.id}`,
      name: franchise.name,
      description: `Watch every film in ${franchise.label}.`,
      category: "Franchises",
      tier: franchise.tier,
      icon: franchise.icon,
      target: franchise.total,
      measure: (s) => {
        const seen = owned(s).length;
        return {
          progress: seen,
          detail:
            seen >= franchise.total
              ? `all ${franchise.total} of them`
              : `${franchise.total - seen} still to see`,
        };
      },
      evidence: (s) => {
        const seen = owned(s);
        return {
          caption:
            seen.length > 0
              ? `${seen.length} of ${franchise.total} watched`
              : `None of ${franchise.label} watched yet`,
          items: newestFirst(seen.map((movie) => filmItem(movie))),
        };
      },
    };
  }),
];

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
