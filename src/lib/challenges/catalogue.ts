/**
 * Monthly challenges: three at a time, a new trio each month, bonus XP for each.
 *
 * An achievement is a claim about a whole history; a challenge is something to
 * do this month. That is why they reset: an account arriving with twenty years
 * of imported plays starts every month level with one opened yesterday.
 *
 * Pure. Every measure reads one month of plays, the ratings written in it, and
 * cached facts about the titles involved (`TitleMeta`), which the server side
 * gathers in four indexed reads. Ids, targets and XP are stored against
 * `ChallengeRun` rows, so they must not change once a month has used them.
 */

export type WindowPlay = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
  runtime: number;
  watchedAt: Date;
};

export type TitleFacts = {
  genres: string[];
  originalLanguage: string | null;
  year: number | null;
  runtime: number | null;
};

export type ChallengeWindow = {
  /** Every viewing in the month, oldest first. */
  plays: WindowPlay[];
  /** Keyed `${mediaType}-${tmdbId}`. Missing facts count as unknown, never as a match. */
  facts: Map<string, TitleFacts>;
  /** Ratings written or changed during the month. */
  ratings: { review: string | null }[];
  /** Shows with a viewing before the month began. */
  showsBefore: Set<number>;
  /** The month's year, for "released this year". */
  year: number;
};

/**
 * Names from the app's icon set (`components/icon`); the strip draws them,
 * and the typecheck fails there if one is missing from the set.
 */
export type ChallengeIcon =
  | "tv"
  | "film"
  | "hourglass"
  | "calendarCheck"
  | "flame"
  | "shapes"
  | "languages"
  | "history"
  | "camera"
  | "sparkle"
  | "layers"
  | "clapperboard"
  | "gauge"
  | "pen"
  | "monitorPlay"
  | "ruler"
  | "timer"
  | "ghost"
  | "sun"
  | "moon";

export type Challenge = {
  id: string;
  name: string;
  icon: ChallengeIcon;
  /** What the strip says: short enough for one line on a phone. */
  short: string;
  description: string;
  target: number;
  xp: number;
  /** Time-based ones read in hours. */
  unit: "count" | "minutes";
  measure: (w: ChallengeWindow) => number;
};

// ---------------------------------------------------------------------------
// Measures

const factsOf = (w: ChallengeWindow, p: WindowPlay) => w.facts.get(`${p.mediaType}-${p.tmdbId}`);
const filmsIn = (w: ChallengeWindow) => w.plays.filter((p) => p.mediaType === "movie");
const episodesIn = (w: ChallengeWindow) => w.plays.filter((p) => p.mediaType === "tv");

/** A viewing's day in the server's own calendar, which is the household's. */
const dayOf = (p: WindowPlay) =>
  `${p.watchedAt.getFullYear()}-${p.watchedAt.getMonth() + 1}-${p.watchedAt.getDate()}`;

/** Distinct titles among the plays that pass a test. */
function distinctTitles(plays: WindowPlay[], test: (p: WindowPlay) => boolean): number {
  return new Set(plays.filter(test).map((p) => `${p.mediaType}-${p.tmdbId}`)).size;
}

function hasGenre(w: ChallengeWindow, p: WindowPlay, needle: string) {
  return (factsOf(w, p)?.genres ?? []).some((g) => g.toLowerCase().includes(needle));
}

/** The longest run of consecutive days with at least one viewing. */
function longestRun(plays: WindowPlay[]): number {
  const days = [
    ...new Set(
      plays.map((p) => new Date(p.watchedAt.getFullYear(), p.watchedAt.getMonth(), p.watchedAt.getDate()).getTime()),
    ),
  ].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    // Rounded, because a day across a clock change is 23 or 25 hours long.
    run = i > 0 && Math.round((days[i] - days[i - 1]) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** The most viewings on any one day, optionally counted per group within the day. */
function busiestDay(plays: WindowPlay[], group: (p: WindowPlay) => string = () => "") {
  const counts = new Map<string, number>();
  for (const p of plays) {
    const key = `${dayOf(p)}|${group(p)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

function filmRuntime(w: ChallengeWindow, p: WindowPlay) {
  return Math.max(p.runtime, factsOf(w, p)?.runtime ?? 0);
}

// ---------------------------------------------------------------------------
// The pool, in rotation order

export const CHALLENGES: Challenge[] = [
  {
    id: "marathon-month",
    name: "Marathon Month",
    icon: "tv",
    short: "Watch 20 episodes",
    description: "Watch 20 episodes before the month is out.",
    target: 20,
    xp: 500,
    unit: "count",
    measure: (w) => episodesIn(w).length,
  },
  {
    id: "feature-presentation",
    name: "Feature Presentation",
    icon: "film",
    short: "Watch 8 films",
    description: "Watch eight films this month.",
    target: 8,
    xp: 500,
    unit: "count",
    measure: (w) => filmsIn(w).length,
  },
  {
    id: "twenty-five-hours",
    name: "Twenty-Five Hours",
    icon: "hourglass",
    short: "Spend 25 hours watching",
    description: "Spend 25 hours watching something this month.",
    target: 25 * 60,
    xp: 600,
    unit: "minutes",
    measure: (w) => w.plays.reduce((sum, p) => sum + p.runtime, 0),
  },
  {
    id: "half-the-month",
    name: "Half the Month",
    icon: "calendarCheck",
    short: "Log on 15 different days",
    description: "Log something on fifteen different days.",
    target: 15,
    xp: 700,
    unit: "count",
    measure: (w) => new Set(w.plays.map(dayOf)).size,
  },
  {
    id: "seven-in-a-row",
    name: "Seven in a Row",
    icon: "flame",
    short: "Log 7 days running",
    description: "Log something seven days running, inside this month.",
    target: 7,
    xp: 600,
    unit: "count",
    measure: (w) => longestRun(w.plays),
  },
  {
    id: "genre-tour",
    name: "Genre Tour",
    icon: "shapes",
    short: "Watch 6 different genres",
    description: "Watch something from six different genres.",
    target: 6,
    xp: 600,
    unit: "count",
    measure: (w) => new Set(w.plays.flatMap((p) => factsOf(w, p)?.genres ?? [])).size,
  },
  {
    id: "passport",
    name: "Passport",
    icon: "languages",
    short: "3 titles not in English",
    description: "Watch three titles that were not made in English.",
    target: 3,
    xp: 500,
    unit: "count",
    measure: (w) =>
      distinctTitles(w.plays, (p) => {
        const language = factsOf(w, p)?.originalLanguage;
        return Boolean(language) && language !== "en";
      }),
  },
  {
    id: "time-traveller",
    name: "Time Traveller",
    icon: "history",
    short: "Films from 3 decades",
    description: "Watch films from three different decades.",
    target: 3,
    xp: 500,
    unit: "count",
    measure: (w) => {
      const decades = filmsIn(w)
        .map((p) => factsOf(w, p)?.year)
        .filter((y): y is number => typeof y === "number")
        .map((y) => Math.floor(y / 10));
      return new Set(decades).size;
    },
  },
  {
    id: "dust-off-a-classic",
    name: "Dust Off a Classic",
    icon: "camera",
    short: "Something made before 1980",
    description: "Watch a film made before 1980.",
    target: 1,
    xp: 400,
    unit: "count",
    measure: (w) => filmsIn(w).filter((p) => (factsOf(w, p)?.year ?? Infinity) < 1980).length,
  },
  {
    id: "hot-off-the-press",
    name: "Hot off the Press",
    icon: "sparkle",
    short: "2 films from this year",
    description: "Watch two films released this year.",
    target: 2,
    xp: 400,
    unit: "count",
    measure: (w) => distinctTitles(filmsIn(w), (p) => factsOf(w, p)?.year === w.year),
  },
  {
    id: "one-more-episode",
    name: "One More Episode",
    icon: "layers",
    short: "5 episodes of one show in a day",
    description: "Watch five episodes of the same show in one day.",
    target: 5,
    xp: 400,
    unit: "count",
    measure: (w) => busiestDay(episodesIn(w), (p) => String(p.tmdbId)),
  },
  {
    id: "double-bill",
    name: "Double Bill",
    icon: "clapperboard",
    short: "2 films on the same day",
    description: "Watch two films on the same day.",
    target: 2,
    xp: 400,
    unit: "count",
    measure: (w) => busiestDay(filmsIn(w)),
  },
  {
    id: "give-your-verdict",
    name: "Give Your Verdict",
    icon: "gauge",
    short: "Rate 10 titles",
    description: "Rate ten titles this month.",
    target: 10,
    xp: 500,
    unit: "count",
    measure: (w) => w.ratings.length,
  },
  {
    id: "in-your-own-words",
    name: "In Your Own Words",
    icon: "pen",
    short: "Write 3 reviews",
    description: "Write three reviews this month.",
    target: 3,
    xp: 600,
    unit: "count",
    measure: (w) => w.ratings.filter((r) => (r.review ?? "").trim() !== "").length,
  },
  {
    id: "new-horizons",
    name: "New Horizons",
    icon: "monitorPlay",
    short: "Start 3 new shows",
    description: "Start three shows you had never watched before.",
    target: 3,
    xp: 600,
    unit: "count",
    measure: (w) => distinctTitles(episodesIn(w), (p) => !w.showsBefore.has(p.tmdbId)),
  },
  {
    id: "the-long-sit",
    name: "The Long Sit",
    icon: "ruler",
    short: "A film over 2.5 hours",
    description: "Watch a film over two and a half hours long.",
    target: 1,
    xp: 400,
    unit: "count",
    measure: (w) => filmsIn(w).filter((p) => filmRuntime(w, p) >= 150).length,
  },
  {
    id: "quick-ones",
    name: "Quick Ones",
    icon: "timer",
    short: "3 films under 100 minutes",
    description: "Watch three films under a hundred minutes.",
    target: 3,
    xp: 400,
    unit: "count",
    measure: (w) =>
      distinctTitles(filmsIn(w), (p) => {
        const runtime = filmRuntime(w, p);
        return runtime > 0 && runtime < 100;
      }),
  },
  {
    id: "drawn-out",
    name: "Drawn Out",
    icon: "shapes",
    short: "3 animated titles",
    description: "Watch three animated titles.",
    target: 3,
    xp: 500,
    unit: "count",
    measure: (w) => distinctTitles(w.plays, (p) => hasGenre(w, p, "animation")),
  },
  {
    id: "non-fiction",
    name: "Non-Fiction",
    icon: "camera",
    short: "2 documentaries",
    description: "Watch two documentaries.",
    target: 2,
    xp: 500,
    unit: "count",
    measure: (w) => distinctTitles(w.plays, (p) => hasGenre(w, p, "documentary")),
  },
  {
    id: "something-scary",
    name: "Something Scary",
    icon: "ghost",
    short: "3 horror films",
    description: "Watch three horror films.",
    target: 3,
    xp: 500,
    unit: "count",
    measure: (w) => distinctTitles(filmsIn(w), (p) => hasGenre(w, p, "horror")),
  },
  {
    id: "weekend-regular",
    name: "Weekend Regular",
    icon: "sun",
    short: "4 different weekend days",
    description: "Watch something on four different weekend days.",
    target: 4,
    xp: 500,
    unit: "count",
    measure: (w) => new Set(w.plays.filter((p) => [0, 6].includes(p.watchedAt.getDay())).map(dayOf)).size,
  },
  {
    id: "after-midnight",
    name: "After Midnight",
    icon: "moon",
    short: "3 times after midnight",
    description: "Watch something between midnight and four, three times.",
    target: 3,
    xp: 400,
    unit: "count",
    measure: (w) => w.plays.filter((p) => p.watchedAt.getHours() < 4).length,
  },
];

export const CHALLENGES_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

export const PER_MONTH = 3;

/** "2026-09": how a month is written on `ChallengeRun`. */
export function periodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The trio running in a month, decided by the month alone: everybody on the
 * instance has the same three and there is nothing to store or seed. Each
 * month takes the next three in the pool, so nothing carries over from last
 * month; the pool is not a multiple of three, so the trios themselves shift on
 * every pass through it.
 */
export function challengesFor(date: Date): Challenge[] {
  const month = date.getFullYear() * 12 + date.getMonth();
  const start = (month * PER_MONTH) % CHALLENGES.length;
  return Array.from({ length: PER_MONTH }, (_, i) => CHALLENGES[(start + i) % CHALLENGES.length]);
}

export type ChallengeProgress = { id: string; progress: number };

/** How far along each challenge is, capped at its target. */
export function evaluate(window: ChallengeWindow, active: Challenge[]): ChallengeProgress[] {
  return active.map((c) => ({ id: c.id, progress: Math.min(Math.max(0, Math.round(c.measure(window))), c.target) }));
}

/** "14/20", or "8h/25h" for the time-based ones. */
export function progressLabel(challenge: Challenge, progress: number): string {
  if (challenge.unit === "minutes") return `${Math.floor(progress / 60)}h/${Math.round(challenge.target / 60)}h`;
  return `${progress}/${challenge.target}`;
}
