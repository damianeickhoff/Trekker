/**
 * Monthly challenges: three of them, new every month, worth bonus XP.
 *
 * Where an achievement is a lifetime claim — a hundred films, every Best
 * Picture winner — a challenge is a small thing to do *this month*. That is the
 * whole point of them: they reset, so an account with twenty years of imported
 * history starts each month on exactly the same line as one opened yesterday.
 *
 * Everything here is measured from one month of plays, the ratings written in
 * that month, and the cached TMDB facts about the titles involved. Nothing
 * needs the network, which is what lets the bar sit on the dashboard.
 */

export type ChallengeWindow = {
  /** Every viewing in the month, oldest first. */
  plays: {
    mediaType: "movie" | "tv";
    tmdbId: number;
    title: string;
    seasonNumber: number | null;
    episodeNumber: number | null;
    runtime: number;
    watchedAt: Date;
  }[];
  /** Cached TMDB facts, keyed `${mediaType}-${tmdbId}`. */
  facts: Map<
    string,
    {
      genres: string[];
      originalLanguage: string | null;
      year: number | null;
      runtime: number | null;
    }
  >;
  /** Ratings written or changed during the month. */
  ratings: { score: number; review: string | null }[];
  /** Show ids the user had already watched before this month began. */
  showsBefore: Set<number>;
  /** The month itself. */
  year: number;
  month: number;
};

export type Challenge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  /** Bonus XP for finishing it. */
  xp: number;
  /** How the numbers read under the bar. */
  unit?: "count" | "minutes";
  measure: (window: ChallengeWindow) => number;
};

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function factsFor(w: ChallengeWindow, play: ChallengeWindow["plays"][number]) {
  return w.facts.get(`${play.mediaType}-${play.tmdbId}`);
}

function hasGenre(
  w: ChallengeWindow,
  play: ChallengeWindow["plays"][number],
  ...needles: string[]
) {
  const genres = factsFor(w, play)?.genres ?? [];
  return genres.some((genre) =>
    needles.some((needle) => genre.toLowerCase().includes(needle.toLowerCase())),
  );
}

const films = (w: ChallengeWindow) => w.plays.filter((p) => p.mediaType === "movie");
const episodes = (w: ChallengeWindow) => w.plays.filter((p) => p.mediaType === "tv");

/** Distinct calendar days with something on them. */
function dayKeys(plays: ChallengeWindow["plays"]) {
  return new Set(
    plays.map((p) => `${p.watchedAt.getFullYear()}-${p.watchedAt.getMonth()}-${p.watchedAt.getDate()}`),
  );
}

function longestStreak(plays: ChallengeWindow["plays"]) {
  const days = [...dayKeys(plays)]
    .map((key) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);

  let longest = 0;
  let run = 0;
  let previous: number | null = null;

  for (const day of days) {
    run = previous !== null && Math.round((day - previous) / 86_400_000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

/** The most of anything counted per day. */
function bestDay(plays: ChallengeWindow["plays"], group?: (p: ChallengeWindow["plays"][number]) => string) {
  const buckets = new Map<string, number>();
  for (const play of plays) {
    const day = `${play.watchedAt.getFullYear()}-${play.watchedAt.getMonth()}-${play.watchedAt.getDate()}`;
    const key = group ? `${day}|${group(play)}` : day;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...buckets.values());
}

// ---------------------------------------------------------------------------
// The pool.
// ---------------------------------------------------------------------------

export const CHALLENGES: Challenge[] = [
  {
    id: "marathon-month",
    name: "Marathon Month",
    description: "Watch 20 episodes before the month is out.",
    icon: "tv",
    target: 20,
    xp: 500,
    measure: (w) => episodes(w).length,
  },
  {
    id: "feature-presentation",
    name: "Feature Presentation",
    description: "Watch eight films this month.",
    icon: "film",
    target: 8,
    xp: 500,
    measure: (w) => films(w).length,
  },
  {
    id: "twenty-five-hours",
    name: "Twenty-Five Hours",
    description: "Spend 25 hours watching something this month.",
    icon: "hourglass",
    target: 25 * 60,
    xp: 600,
    unit: "minutes",
    measure: (w) => w.plays.reduce((sum, play) => sum + play.runtime, 0),
  },
  {
    id: "half-the-month",
    name: "Half the Month",
    description: "Log something on fifteen different days.",
    icon: "calendar-check",
    target: 15,
    xp: 700,
    measure: (w) => dayKeys(w.plays).size,
  },
  {
    id: "seven-in-a-row",
    name: "Seven in a Row",
    description: "Log something seven days running, inside this month.",
    icon: "flame",
    target: 7,
    xp: 600,
    measure: (w) => longestStreak(w.plays),
  },
  {
    id: "genre-tour",
    name: "Genre Tour",
    description: "Watch something from six different genres.",
    icon: "shapes",
    target: 6,
    xp: 600,
    measure: (w) => {
      const genres = new Set<string>();
      for (const play of w.plays) {
        for (const genre of factsFor(w, play)?.genres ?? []) genres.add(genre);
      }
      return genres.size;
    },
  },
  {
    id: "passport",
    name: "Passport",
    description: "Watch three titles that were not made in English.",
    icon: "languages",
    target: 3,
    xp: 500,
    measure: (w) => {
      const seen = new Set<string>();
      for (const play of w.plays) {
        const language = factsFor(w, play)?.originalLanguage;
        if (language && language !== "en") seen.add(`${play.mediaType}-${play.tmdbId}`);
      }
      return seen.size;
    },
  },
  {
    id: "time-traveller",
    name: "Time Traveller",
    description: "Watch films from three different decades.",
    icon: "history",
    target: 3,
    xp: 500,
    measure: (w) => {
      const decades = new Set<number>();
      for (const play of films(w)) {
        const year = factsFor(w, play)?.year;
        if (year) decades.add(Math.floor(year / 10) * 10);
      }
      return decades.size;
    },
  },
  {
    id: "dust-off-a-classic",
    name: "Dust Off a Classic",
    description: "Watch a film made before 1980.",
    icon: "camera",
    target: 1,
    xp: 400,
    measure: (w) => films(w).filter((p) => (factsFor(w, p)?.year ?? 9999) < 1980).length,
  },
  {
    id: "hot-off-the-press",
    name: "Hot off the Press",
    description: "Watch two films released this year.",
    icon: "sparkles",
    target: 2,
    xp: 400,
    measure: (w) => {
      const seen = new Set<number>();
      for (const play of films(w)) {
        if (factsFor(w, play)?.year === w.year) seen.add(play.tmdbId);
      }
      return seen.size;
    },
  },
  {
    id: "one-more-episode",
    name: "One More Episode",
    description: "Watch five episodes of the same show in one day.",
    icon: "layers",
    target: 5,
    xp: 400,
    measure: (w) => bestDay(episodes(w), (p) => String(p.tmdbId)),
  },
  {
    id: "double-bill",
    name: "Double Bill",
    description: "Watch two films on the same day.",
    icon: "clapperboard",
    target: 2,
    xp: 400,
    measure: (w) => bestDay(films(w)),
  },
  {
    id: "give-your-verdict",
    name: "Give Your Verdict",
    description: "Rate ten titles this month.",
    icon: "gauge",
    target: 10,
    xp: 500,
    measure: (w) => w.ratings.length,
  },
  {
    id: "in-your-own-words",
    name: "In Your Own Words",
    description: "Write three reviews this month.",
    icon: "pen-line",
    target: 3,
    xp: 600,
    measure: (w) => w.ratings.filter((r) => (r.review ?? "").trim().length > 0).length,
  },
  {
    id: "new-horizons",
    name: "New Horizons",
    description: "Start three shows you had never watched before.",
    icon: "monitor-play",
    target: 3,
    xp: 600,
    measure: (w) => {
      const started = new Set<number>();
      for (const play of episodes(w)) {
        if (!w.showsBefore.has(play.tmdbId)) started.add(play.tmdbId);
      }
      return started.size;
    },
  },
  {
    id: "the-long-sit",
    name: "The Long Sit",
    description: "Watch a film over two and a half hours long.",
    icon: "ruler",
    target: 1,
    xp: 400,
    measure: (w) =>
      films(w).filter((p) => Math.max(p.runtime, factsFor(w, p)?.runtime ?? 0) >= 150).length,
  },
  {
    id: "quick-ones",
    name: "Quick Ones",
    description: "Watch three films under a hundred minutes.",
    icon: "timer",
    target: 3,
    xp: 400,
    measure: (w) => {
      const seen = new Set<number>();
      for (const play of films(w)) {
        const runtime = Math.max(play.runtime, factsFor(w, play)?.runtime ?? 0);
        if (runtime > 0 && runtime < 100) seen.add(play.tmdbId);
      }
      return seen.size;
    },
  },
  {
    id: "drawn-out",
    name: "Drawn Out",
    description: "Watch three animated titles.",
    icon: "shapes",
    target: 3,
    xp: 500,
    measure: (w) => {
      const seen = new Set<string>();
      for (const play of w.plays) {
        if (hasGenre(w, play, "animation")) seen.add(`${play.mediaType}-${play.tmdbId}`);
      }
      return seen.size;
    },
  },
  {
    id: "non-fiction",
    name: "Non-Fiction",
    description: "Watch two documentaries.",
    icon: "camera",
    target: 2,
    xp: 500,
    measure: (w) => {
      const seen = new Set<string>();
      for (const play of w.plays) {
        if (hasGenre(w, play, "documentary")) seen.add(`${play.mediaType}-${play.tmdbId}`);
      }
      return seen.size;
    },
  },
  {
    id: "something-scary",
    name: "Something Scary",
    description: "Watch three horror films.",
    icon: "ghost",
    target: 3,
    xp: 500,
    measure: (w) => {
      const seen = new Set<number>();
      for (const play of films(w)) {
        if (hasGenre(w, play, "horror")) seen.add(play.tmdbId);
      }
      return seen.size;
    },
  },
  {
    id: "weekend-regular",
    name: "Weekend Regular",
    description: "Watch something on four different weekend days.",
    icon: "sun",
    target: 4,
    xp: 500,
    measure: (w) =>
      dayKeys(w.plays.filter((p) => [0, 6].includes(p.watchedAt.getDay()))).size,
  },
  {
    id: "after-midnight",
    name: "After Midnight",
    description: "Watch something between midnight and four, three times.",
    icon: "moon",
    target: 3,
    xp: 400,
    measure: (w) =>
      w.plays.filter((p) => {
        const hour = p.watchedAt.getHours();
        return hour >= 0 && hour < 4;
      }).length,
  },
];

export const CHALLENGES_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

/** How many run at once. */
export const PER_MONTH = 3;

/** "2026-08" — how a month is written down. */
export function periodKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthName(date: Date) {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/**
 * Which three are running in a given month.
 *
 * Picked by the month itself rather than stored, so every account on the
 * instance is doing the same three and there is no state to seed, migrate or
 * keep in step.
 *
 * Each month takes the next three in order, so no challenge carries over from
 * the month before — a set that only rotated one at a time would leave two
 * thirds of the bar looking exactly as it did yesterday. The pool's length is
 * not a multiple of three, so each pass through it lands on different
 * boundaries and the trios themselves keep changing.
 */
export function challengesFor(date: Date): Challenge[] {
  const index = date.getFullYear() * 12 + date.getMonth();
  const size = CHALLENGES.length;
  const start = (index * PER_MONTH) % size;

  return Array.from({ length: PER_MONTH }, (_, i) => CHALLENGES[(start + i) % size]);
}
