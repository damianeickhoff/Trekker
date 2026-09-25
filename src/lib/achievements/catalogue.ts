import type { Tier } from "../levels";
import type { IconName } from "@/components/icon";
import { BEST_PICTURE_COUNT, isBestPictureWinner } from "./best-picture";
import { FRANCHISES, inFranchise } from "./franchises";

/**
 * The badges: thirty-seven achievements in six groups, and a badge for each
 * named franchise in Completion. Pure: every measure reads a `Snapshot`, which
 * `snapshot.ts` builds from rows and the shared title facts, so the whole
 * catalogue is testable without a database.
 *
 * Ids are stored on `UnlockedAchievement`, so they never change. A badge is a
 * claim about a whole history; the monthly challenges are the thing that
 * resets.
 */

export type Group = "Milestones" | "Habits" | "Seasons" | "Taste" | "Completion" | "People";

export const GROUPS: Group[] = ["Milestones", "Habits", "Seasons", "Taste", "Completion", "People"];

export type Facts = {
  title: string;
  genres: string[];
  originalLanguage: string | null;
  year: number | null;
  runtime: number | null;
  collectionId: number | null;
};

export type SnapshotFilm = {
  tmdbId: number;
  title: string;
  runtime: number;
  /** TMDB audience score (0 to 100) captured when it was logged. */
  score: number | null;
  /** The first viewing: a collection badge counts titles, not rewatches. */
  watchedAt: Date;
  facts: Facts | null;
};

export type SnapshotEpisode = { showId: number; watchedAt: Date };

export type SnapshotPlay = { mediaType: "movie" | "tv"; tmdbId: number; runtime: number; watchedAt: Date };

/** One calendar day with something logged, in the household's time. */
export type Day = { date: Date; minutes: number; films: number; episodesPerShow: Map<number, number> };

export type FranchiseProgress = { id: number; name: string; owned: number; total: number };

export type Snapshot = {
  /** Distinct films: a collection badge counts different things. */
  films: SnapshotFilm[];
  /** Distinct episodes. */
  episodes: SnapshotEpisode[];
  /** Every viewing: a habit badge counts occasions, and a rewatch is one. */
  plays: SnapshotPlay[];
  showFacts: Map<number, Facts>;
  showNames: Map<number, string>;
  ratings: { score: number; review: string | null }[];
  watchlistCount: number;
  friendCount: number;
  /** Every day with something on it, oldest first. */
  days: Day[];
  /** Shows watched to the end of a finished run, from `TitleState`. */
  finishedShows: number;
  /** TMDB collections with two or more films seen, most complete first. */
  franchises: FranchiseProgress[];
};

export type Measured = { progress: number; detail?: string };

export type Achievement = {
  id: string;
  /**
   * What the medal draws, the old app's icon for the badge in the rebuild's
   * own stroke set, so a cabinet of medals reads as different things earned
   * rather than a row of the same trophy.
   */
  icon: IconName;
  name: string;
  description: string;
  group: Group;
  tier: Tier;
  target: number;
  /** A plain count, or minutes read as hours. */
  unit?: "count" | "minutes";
  /** Nothing to count: you have it or you do not. */
  binary?: boolean;
  /**
   * Seasonal badges only: when the window opens (month 0 to 11, and a day
   * where it is a day), so a closed one says when rather than "0%".
   */
  opens?: { month: number; day?: number; until?: number };
  measure: (s: Snapshot) => Measured;
};

// ---------------------------------------------------------------------------
// Measures

const JAN = 0;
const FEB = 1;
const JUL = 6;
const AUG = 7;
const OCT = 9;
const NOV = 10;
const DEC = 11;

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

function hasGenre(facts: Facts | null | undefined, ...needles: string[]) {
  return (facts?.genres ?? []).some((g) => needles.some((n) => g.toLowerCase().includes(n)));
}

/** Films and shows together, one row per title. */
function titles(s: Snapshot): (Facts | null)[] {
  return [...s.films.map((f) => f.facts), ...s.showFacts.values()];
}

/**
 * The best single calendar year for something counted per year. A yearly
 * badge is one lap of the calendar; five years' total must not stand in.
 */
function bestYear<T extends { watchedAt: Date }>(rows: T[], keep: (row: T) => boolean = () => true) {
  const perYear = new Map<number, number>();
  let best = { count: 0, year: null as number | null };
  for (const row of rows) {
    if (!keep(row)) continue;
    const year = row.watchedAt.getFullYear();
    const n = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, n);
    if (n > best.count) best = { count: n, year };
  }
  return best;
}

/** Distinct titles per calendar year, best year wins. */
function bestYearDistinct(rows: { watchedAt: Date; key: string }[]) {
  const perYear = new Map<number, Set<string>>();
  for (const row of rows) {
    const year = row.watchedAt.getFullYear();
    const set = perYear.get(year) ?? new Set<string>();
    set.add(row.key);
    perYear.set(year, set);
  }
  let best = { count: 0, year: null as number | null };
  for (const [year, set] of perYear) if (set.size > best.count) best = { count: set.size, year };
  return best;
}

const closest = (year: number | null) => (year === null ? undefined : `${year} is closest`);

/** The longest run of consecutive days. Rounded, because a day across a clock change is 23 or 25 hours. */
export function longestStreak(days: { date: Date }[]) {
  let longest = 0;
  let current = 0;
  let previous: number | null = null;
  for (const day of days) {
    const midnight = new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate()).getTime();
    current = previous !== null && Math.round((midnight - previous) / 86_400_000) === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = midnight;
  }
  return longest;
}

/** Winners seen, a remake never counted twice. */
function bestPictureSeen(s: Snapshot) {
  const seen = new Set<string>();
  for (const film of s.films) {
    const title = film.facts?.title ?? film.title;
    if (isBestPictureWinner(title, film.facts?.year ?? null)) seen.add(title.toLowerCase());
  }
  return seen.size;
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

const totalMinutes = (s: Snapshot) => s.days.reduce((sum, d) => sum + d.minutes, 0);

// ---------------------------------------------------------------------------
// The catalogue

const CORE: Achievement[] = [
  // -- Milestones ----------------------------------------------------------
  {
    id: "first-contact",
    icon: "sparkle",
    name: "First Contact",
    description: "Log the very first thing you watch.",
    group: "Milestones",
    tier: "bronze",
    target: 1,
    binary: true,
    measure: (s) => ({ progress: s.days.length > 0 ? 1 : 0 }),
  },
  {
    id: "century-club",
    icon: "film",
    name: "Century Club",
    description: "Watch 100 films, all told.",
    group: "Milestones",
    tier: "silver",
    target: 100,
    measure: (s) => ({ progress: s.films.length, detail: `${s.films.length.toLocaleString("en-GB")} so far` }),
  },
  {
    id: "hundred-in-a-year",
    icon: "calendarCheck",
    name: "The Hundred",
    description: "Watch 100 films inside a single calendar year.",
    group: "Milestones",
    tier: "gold",
    target: 100,
    measure: (s) => {
      const best = bestYear(s.films);
      return { progress: best.count, detail: best.year ? `${best.year} is closest · ${best.count}` : undefined };
    },
  },
  {
    id: "remote-control",
    icon: "tv",
    name: "Remote Control",
    description: "Watch 1,000 episodes of television.",
    group: "Milestones",
    tier: "gold",
    target: 1000,
    // Volume rather than variety, so a series worth going through twice counts twice.
    measure: (s) => {
      const n = s.plays.filter((p) => p.mediaType === "tv").length;
      return { progress: n, detail: `${n.toLocaleString("en-GB")} so far` };
    },
  },
  {
    id: "channel-surfer",
    icon: "monitorPlay",
    name: "Channel Surfer",
    description: "Start 50 different shows.",
    group: "Milestones",
    tier: "silver",
    target: 50,
    measure: (s) => ({ progress: new Set(s.episodes.map((e) => e.showId)).size }),
  },
  {
    id: "lost-weekend",
    icon: "hourglass",
    name: "Lost Weekend",
    description: "Spend 100 hours in front of something.",
    group: "Milestones",
    tier: "bronze",
    target: 100 * 60,
    unit: "minutes",
    measure: (s) => ({ progress: totalMinutes(s) }),
  },
  {
    id: "long-haul",
    icon: "hourglass",
    name: "The Long Haul",
    description: "Spend 1,000 hours in front of something.",
    group: "Milestones",
    tier: "legend",
    target: 1000 * 60,
    unit: "minutes",
    measure: (s) => ({ progress: totalMinutes(s) }),
  },

  // -- Habits --------------------------------------------------------------
  {
    id: "seven-nights",
    icon: "flame",
    name: "Seven Nights",
    description: "Log something seven days running.",
    group: "Habits",
    tier: "bronze",
    target: 7,
    measure: (s) => ({ progress: longestStreak(s.days) }),
  },
  {
    id: "iron-eyes",
    icon: "flame",
    name: "Iron Eyes",
    description: "Log something thirty days running.",
    group: "Habits",
    tier: "gold",
    target: 30,
    measure: (s) => {
      const streak = longestStreak(s.days);
      return { progress: streak, detail: `longest run ${plural(streak, "day")}` };
    },
  },
  {
    id: "double-feature",
    icon: "clapperboard",
    name: "Double Feature",
    description: "Watch two films in one day.",
    group: "Habits",
    tier: "bronze",
    target: 2,
    measure: (s) => ({ progress: Math.max(0, ...s.days.map((d) => d.films)) }),
  },
  {
    id: "triple-bill",
    icon: "clapperboard",
    name: "Triple Bill",
    description: "Watch three films in one day.",
    group: "Habits",
    tier: "silver",
    target: 3,
    measure: (s) => ({ progress: Math.max(0, ...s.days.map((d) => d.films)) }),
  },
  {
    id: "just-one-more",
    icon: "layers",
    name: "Just One More",
    description: "Watch ten episodes of the same show in a single day.",
    group: "Habits",
    tier: "silver",
    target: 10,
    measure: (s) => {
      let best = 0;
      let show: number | null = null;
      for (const day of s.days) {
        for (const [showId, count] of day.episodesPerShow) {
          if (count > best) {
            best = count;
            show = showId;
          }
        }
      }
      const name = show !== null ? s.showNames.get(show) : undefined;
      return { progress: best, detail: name ? `best run: ${name}` : undefined };
    },
  },
  {
    id: "night-owl",
    icon: "moon",
    name: "Night Owl",
    description: "Log something between two and five in the morning.",
    group: "Habits",
    tier: "bronze",
    target: 1,
    binary: true,
    // Up at three in the morning is the point, rewatch or not.
    measure: (s) => ({
      progress: s.plays.some((p) => p.watchedAt.getHours() >= 2 && p.watchedAt.getHours() < 5) ? 1 : 0,
    }),
  },
  {
    id: "marathon-day",
    icon: "timer",
    name: "Marathon",
    description: "Put eight hours away in a single day.",
    group: "Habits",
    tier: "gold",
    target: 8 * 60,
    unit: "minutes",
    measure: (s) => ({ progress: Math.max(0, ...s.days.map((d) => d.minutes)) }),
  },

  // -- Seasons -------------------------------------------------------------
  {
    id: "horror-october",
    icon: "ghost",
    name: "Season of the Witch",
    description: "Watch thirteen horror films during one October.",
    group: "Seasons",
    tier: "gold",
    target: 13,
    opens: { month: OCT },
    measure: (s) => {
      const best = bestYear(s.films, (f) => f.watchedAt.getMonth() === OCT && hasGenre(f.facts, "horror"));
      return { progress: best.count, detail: closest(best.year) };
    },
  },
  {
    id: "all-hallows-eve",
    icon: "ghost",
    name: "All Hallows' Eve",
    description: "Watch a horror film on the 31st of October.",
    group: "Seasons",
    tier: "silver",
    target: 1,
    binary: true,
    opens: { month: OCT, day: 31 },
    measure: (s) => ({
      progress: s.films.some(
        (f) => f.watchedAt.getMonth() === OCT && f.watchedAt.getDate() === 31 && hasGenre(f.facts, "horror"),
      )
        ? 1
        : 0,
    }),
  },
  {
    id: "scifi-month",
    icon: "rocket",
    name: "Sci-Fi Month",
    description: "Watch five science fiction titles during one November.",
    group: "Seasons",
    tier: "silver",
    target: 5,
    opens: { month: NOV },
    measure: (s) => {
      const films = s.films
        .filter((f) => f.watchedAt.getMonth() === NOV && hasGenre(f.facts, "science fiction", "sci-fi"))
        .map((f) => ({ watchedAt: f.watchedAt, key: `movie-${f.tmdbId}` }));
      const shows = s.episodes
        .filter(
          (e) => e.watchedAt.getMonth() === NOV && hasGenre(s.showFacts.get(e.showId), "science fiction", "sci-fi"),
        )
        .map((e) => ({ watchedAt: e.watchedAt, key: `tv-${e.showId}` }));
      const best = bestYearDistinct([...films, ...shows]);
      return { progress: best.count, detail: closest(best.year) };
    },
  },
  {
    id: "yule-log",
    icon: "gift",
    name: "Yule Log",
    description: "Watch three films over Christmas, the 24th to the 26th.",
    group: "Seasons",
    tier: "bronze",
    target: 3,
    opens: { month: DEC, day: 24, until: 26 },
    measure: (s) => {
      const best = bestYear(
        s.films,
        (f) => f.watchedAt.getMonth() === DEC && f.watchedAt.getDate() >= 24 && f.watchedAt.getDate() <= 26,
      );
      return { progress: best.count, detail: closest(best.year) };
    },
  },
  {
    id: "love-actually",
    icon: "heart",
    name: "Love Actually",
    description: "Watch a romance in February.",
    group: "Seasons",
    tier: "bronze",
    target: 1,
    binary: true,
    opens: { month: FEB },
    measure: (s) => ({
      progress: s.films.some((f) => f.watchedAt.getMonth() === FEB && hasGenre(f.facts, "romance")) ? 1 : 0,
    }),
  },
  {
    id: "new-years-resolution",
    icon: "partyPopper",
    name: "Resolution",
    description: "Log something on the first of January.",
    group: "Seasons",
    tier: "bronze",
    target: 1,
    binary: true,
    opens: { month: JAN, day: 1 },
    measure: (s) => ({
      progress: s.plays.some((p) => p.watchedAt.getMonth() === JAN && p.watchedAt.getDate() === 1) ? 1 : 0,
    }),
  },
  {
    id: "blockbuster-summer",
    icon: "sun",
    name: "Blockbuster Summer",
    description: "Watch ten films across one July and August.",
    group: "Seasons",
    tier: "silver",
    target: 10,
    opens: { month: JUL, until: AUG },
    measure: (s) => {
      const best = bestYear(s.films, (f) => f.watchedAt.getMonth() === JUL || f.watchedAt.getMonth() === AUG);
      return { progress: best.count, detail: closest(best.year) };
    },
  },

  // -- Taste ---------------------------------------------------------------
  {
    id: "omnivore",
    icon: "shapes",
    name: "Omnivore",
    description: "Watch something from twelve different genres.",
    group: "Taste",
    tier: "silver",
    target: 12,
    measure: (s) => {
      const genres = new Set(titles(s).flatMap((f) => f?.genres ?? []));
      return { progress: genres.size, detail: `${genres.size} so far` };
    },
  },
  {
    id: "subtitle-enjoyer",
    icon: "languages",
    name: "Subtitle Enjoyer",
    description: "Watch ten titles that were not made in English.",
    group: "Taste",
    tier: "silver",
    target: 10,
    measure: (s) => {
      const foreign = titles(s).filter((f) => f?.originalLanguage && f.originalLanguage !== "en");
      const languages = new Set(foreign.map((f) => f!.originalLanguage));
      return { progress: foreign.length, detail: languages.size ? plural(languages.size, "language") : undefined };
    },
  },
  {
    id: "silver-screen",
    icon: "camera",
    name: "Silver Screen",
    description: "Watch ten films made before 1970.",
    group: "Taste",
    tier: "silver",
    target: 10,
    measure: (s) => ({ progress: s.films.filter((f) => f.facts?.year && f.facts.year < 1970).length }),
  },
  {
    id: "time-capsule",
    icon: "history",
    name: "Time Capsule",
    description: "Watch a film from every decade since the 1950s.",
    group: "Taste",
    tier: "gold",
    target: DECADES.length,
    measure: (s) => {
      const covered = new Set<number>();
      for (const f of s.films) {
        const decade = f.facts?.year ? Math.floor(f.facts.year / 10) * 10 : null;
        if (decade !== null && DECADES.includes(decade)) covered.add(decade);
      }
      const missing = DECADES.filter((d) => !covered.has(d));
      return {
        progress: covered.size,
        detail:
          missing.length > 0 && missing.length <= 3
            ? `${covered.size} of ${DECADES.length} · missing ${missing.map((d) => `${String(d).slice(2)}s`).join(", ")}`
            : undefined,
      };
    },
  },
  {
    id: "epic",
    icon: "ruler",
    name: "Epic",
    description: "Sit through a film over three hours long.",
    group: "Taste",
    tier: "bronze",
    target: 1,
    binary: true,
    measure: (s) => {
      let longest: { title: string; runtime: number } | null = null;
      for (const f of s.films) {
        const runtime = Math.max(f.runtime, f.facts?.runtime ?? 0);
        if (!longest || runtime > longest.runtime) longest = { title: f.title, runtime };
      }
      return {
        progress: longest && longest.runtime >= 180 ? 1 : 0,
        detail: longest && longest.runtime > 0 ? `longest: ${longest.title}, ${longest.runtime} min` : undefined,
      };
    },
  },
  {
    id: "critics-darling",
    icon: "star",
    name: "Critic's Darling",
    description: "Watch twenty-five films the audience scores 80 or better.",
    group: "Taste",
    tier: "silver",
    target: 25,
    measure: (s) => ({ progress: s.films.filter((f) => (f.score ?? 0) >= 80).length }),
  },

  // -- Completion ----------------------------------------------------------
  {
    id: "completionist",
    icon: "boxes",
    name: "Completionist",
    description: "Watch every film in a franchise.",
    group: "Completion",
    tier: "gold",
    target: 1,
    measure: (s) => {
      const done = s.franchises.filter((f) => f.owned >= f.total);
      const near = s.franchises[0];
      return {
        progress: done.length > 0 ? 1 : 0,
        detail: done.length
          ? done
              .map((f) => f.name)
              .slice(0, 2)
              .join(", ")
          : near
            ? `closest: ${near.name}, ${near.owned} of ${near.total}`
            : undefined,
      };
    },
  },
  {
    id: "cinematic-universe",
    icon: "boxes",
    name: "Cinematic Universe",
    description: "Finish three franchises end to end.",
    group: "Completion",
    tier: "legend",
    target: 3,
    measure: (s) => {
      const done = s.franchises.filter((f) => f.owned >= f.total);
      return {
        progress: done.length,
        detail: done.length
          ? done
              .map((f) => f.name)
              .slice(0, 3)
              .join(", ")
          : undefined,
      };
    },
  },
  {
    id: "the-end",
    icon: "checkCheck",
    name: "The End",
    description: "Watch a finished show all the way through.",
    group: "Completion",
    tier: "bronze",
    target: 1,
    measure: (s) => ({ progress: s.finishedShows }),
  },
  {
    id: "serial-finisher",
    icon: "checkCheck",
    name: "Serial Finisher",
    description: "Watch ten shows all the way through.",
    group: "Completion",
    tier: "gold",
    target: 10,
    measure: (s) => ({ progress: s.finishedShows }),
  },
  {
    id: "oscar-challenge",
    icon: "award",
    name: "Oscar Challenge",
    description: "Watch ten films that won Best Picture.",
    group: "Completion",
    tier: "silver",
    target: 10,
    measure: (s) => ({ progress: bestPictureSeen(s) }),
  },
  {
    id: "and-the-award-goes-to",
    icon: "award",
    name: "And the Award Goes To",
    description: "Watch every film that has ever won Best Picture.",
    group: "Completion",
    tier: "legend",
    target: BEST_PICTURE_COUNT,
    measure: (s) => {
      const seen = bestPictureSeen(s);
      return { progress: seen, detail: `${seen} of ${BEST_PICTURE_COUNT}` };
    },
  },

  // -- People --------------------------------------------------------------
  {
    id: "everyones-a-critic",
    icon: "gauge",
    name: "Everyone's a Critic",
    description: "Rate a hundred titles.",
    group: "People",
    tier: "silver",
    target: 100,
    measure: (s) => ({ progress: s.ratings.length }),
  },
  {
    id: "wordsmith",
    icon: "pen",
    name: "Wordsmith",
    description: "Write twenty-five reviews.",
    group: "People",
    tier: "gold",
    target: 25,
    measure: (s) => ({ progress: s.ratings.filter((r) => (r.review ?? "").trim() !== "").length }),
  },
  {
    id: "big-plans",
    icon: "bookmark",
    name: "Big Plans",
    description: "Have fifty things waiting on your watchlist.",
    group: "People",
    tier: "bronze",
    target: 50,
    measure: (s) => ({ progress: s.watchlistCount }),
  },
  {
    id: "movie-club",
    icon: "users",
    name: "Movie Club",
    description: "Have five friends on Trekker.",
    group: "People",
    tier: "silver",
    target: 5,
    measure: (s) => ({
      progress: s.friendCount,
      detail: s.friendCount ? plural(s.friendCount, "friend") : "No friends here yet",
    }),
  },
];

/**
 * One badge per named franchise, in Completion beside the generic ones: each
 * is the same achievement with a different set of films behind it.
 */
const NAMED: Achievement[] = FRANCHISES.map((franchise) => ({
  id: `franchise-${franchise.id}`,
  icon: franchise.icon,
  name: franchise.name,
  description: `Watch every film in ${franchise.label}.`,
  group: "Completion",
  tier: franchise.tier,
  target: franchise.total,
  measure: (s) => {
    const seen = s.films.filter((f) =>
      inFranchise(franchise, { tmdbId: f.tmdbId, collectionId: f.facts?.collectionId }),
    ).length;
    return { progress: seen, detail: `${franchise.label} · ${seen} of ${franchise.total}` };
  },
}));

export const ACHIEVEMENTS: Achievement[] = [...CORE, ...NAMED];

/** The thirty-seven that are not a named franchise. */
export const CORE_COUNT = CORE.length;

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export type Evaluated = { id: string; progress: number; detail: string | null };

/** Every achievement measured, progress capped at its target. */
export function evaluateAll(s: Snapshot): Evaluated[] {
  return ACHIEVEMENTS.map((a) => {
    const m = a.measure(s);
    return { id: a.id, progress: Math.min(Math.max(0, Math.round(m.progress)), a.target), detail: m.detail ?? null };
  });
}

/** "42h of 100h" for the time-based ones, "7 of 10" otherwise. */
export function progressLabel(a: Achievement, progress: number) {
  if (a.unit === "minutes") {
    const h = (m: number) => Math.floor(m / 60).toLocaleString("en-GB");
    return `${h(progress)}h of ${h(a.target)}h`;
  }
  return `${progress.toLocaleString("en-GB")} of ${a.target.toLocaleString("en-GB")}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Whether a seasonal badge's window is open on a date. Outside it, a badge
 * with nothing counted yet says when it opens instead of a bare 0%.
 */
export function seasonOpen(a: Achievement, now: Date): boolean {
  if (!a.opens) return true;
  const { month, day, until } = a.opens;
  const m = now.getMonth();
  if (day === undefined) return m >= month && m <= (until ?? month);
  return m === month && now.getDate() >= day && now.getDate() <= (until ?? day);
}

/** "Opens 1 October", "Opens 24 December". */
export function opensLabel(a: Achievement): string | null {
  return a.opens ? `Opens ${a.opens.day ?? 1} ${MONTHS[a.opens.month]}` : null;
}
