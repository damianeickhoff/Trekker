/**
 * What a smart list is asking for.
 *
 * Deliberately free of anything server-side — the filter editor is a client
 * component and needs the same type, the same defaults and the same parser as
 * the code that runs the query. Same reasoning as `genres.ts`: the shape of a
 * question has no business being locked to the server just because answering it
 * is. `smart-lists.ts` is the half that talks to TMDB.
 *
 * Everything here is stored as JSON on `MediaList.filters`, so `parseFilters`
 * has to survive reading a blob written by an older version of this file. It
 * repairs rather than rejects: a filter it does not recognise falls back to the
 * default, because a list that has quietly stopped working is worse than one
 * that has quietly lost a checkbox.
 */

export type SmartKind = "movie" | "tv" | "both";

/**
 * The shelf the titles come off. These are what the user thinks of as "the
 * state of the thing" — what is hot, what is coming, what is best — and each
 * one is a different way of ordering the same catalogue.
 */
export type SmartSource =
  | "all"
  | "popular"
  | "trending"
  | "top-rated"
  | "upcoming"
  | "newest";

export const SOURCES: { value: SmartSource; label: string; blurb: string }[] = [
  {
    value: "all",
    label: "Anything",
    blurb: "The whole catalogue, however obscure. Only your other filters narrow it.",
  },
  {
    value: "popular",
    label: "Popular",
    blurb: "What most people are watching — titles with a real audience behind them.",
  },
  { value: "trending", label: "Trending", blurb: "Moving fastest this week." },
  { value: "top-rated", label: "Top rated", blurb: "Best scored, with enough votes to mean it." },
  { value: "upcoming", label: "Upcoming", blurb: "Not out yet, soonest first." },
  { value: "newest", label: "Newest", blurb: "Most recently released." },
];

/**
 * Production status, as two separate vocabularies that share one control.
 *
 * A film is out or it is not; a series has five states and TMDB has a query
 * parameter for them. Rather than invent a lowest common denominator, both sets
 * live in the same list and the query builder applies each to the half of the
 * search it means anything for — so "returning series" narrows the TV query and
 * simply does not apply to the film one.
 */
export type StatusSlug =
  | "released"
  | "unreleased"
  | "returning"
  | "planned"
  | "in-production"
  | "ended"
  | "cancelled";

export const STATUSES: { value: StatusSlug; label: string; applies: "movie" | "tv" }[] = [
  { value: "released", label: "Released", applies: "movie" },
  { value: "unreleased", label: "Not out yet", applies: "movie" },
  { value: "returning", label: "Returning series", applies: "tv" },
  { value: "planned", label: "Planned", applies: "tv" },
  { value: "in-production", label: "In production", applies: "tv" },
  { value: "ended", label: "Ended", applies: "tv" },
  { value: "cancelled", label: "Cancelled", applies: "tv" },
];

/** TMDB's `with_status` numbers for television. Films have no equivalent. */
export const TV_STATUS_CODES: Partial<Record<StatusSlug, number>> = {
  returning: 0,
  planned: 1,
  "in-production": 2,
  ended: 3,
  cancelled: 4,
};

/**
 * Age ratings, by the country whose ratings board TMDB is asked about.
 *
 * TMDB only carries certifications for films, and only per country, so this is
 * keyed by `WATCH_REGION` with the American board as the fallback — it is the
 * one TMDB's data is most complete for, and an unknown region showing nothing
 * at all would be worse than showing something recognisable.
 */
export const CERTIFICATIONS: Record<string, string[]> = {
  US: ["G", "PG", "PG-13", "R", "NC-17"],
  GB: ["U", "PG", "12A", "12", "15", "18"],
  NL: ["AL", "6", "9", "12", "14", "16", "18"],
  DE: ["0", "6", "12", "16", "18"],
  FR: ["U", "10", "12", "16", "18"],
  ES: ["A", "7", "12", "16", "18"],
  IT: ["T", "VM14", "VM18"],
  AU: ["G", "PG", "M", "MA15+", "R18+"],
  CA: ["G", "PG", "14A", "18A", "R"],
};

export function certificationsFor(region: string): string[] {
  return CERTIFICATIONS[region] ?? CERTIFICATIONS.US;
}

/** Decades offered in simple mode. Matches the discover filter bar's list. */
export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];

/** The bounds the advanced sliders run between. */
export const YEAR_FLOOR = 1950;
export const YEAR_CEILING = new Date().getFullYear() + 5;
export const RUNTIME_FLOOR = 0;
/** Anything at the top of the runtime slider means "no upper limit". */
export const RUNTIME_CEILING = 240;

/** One person a smart list insists on, as chosen in the editor. */
export type CastPick = { id: number; name: string };

export type SmartFilters = {
  kind: SmartKind;
  source: SmartSource;
  /** Genre slugs from `GENRES`. Every one of them must match. */
  genres: string[];
  /** TMDB provider ids — any one of them will do. */
  providers: number[];

  /**
   * People who have to be in it. Every one of them, like genres — "a film with
   * both of these two" is a question worth being able to ask, and "either of
   * them" is two lists.
   *
   * The name is stored alongside the id rather than looked up, because the
   * editor, the rail caption and the saved description all need to say who this
   * is, and none of them is a place to be making a TMDB call to find out.
   */
  cast: CastPick[];
  /** Certification labels for the instance's region. Films only. */
  certifications: string[];
  statuses: StatusSlug[];

  /** Audience score as a percentage, matching what the app shows everywhere. */
  scoreMin: number;
  scoreMax: number;

  /**
   * Simple mode: one decade, or null for any. Advanced mode ignores this and
   * uses the year slider instead — the two are kept apart rather than derived
   * from each other so that switching modes and back does not quietly rewrite
   * the answer the user gave.
   */
  decade: number | null;
  /** Simple mode: an upper runtime bound in minutes, or null for any. */
  maxRuntime: number | null;

  /** Advanced mode: the year and runtime sliders. */
  yearMin: number;
  yearMax: number;
  runtimeMin: number;
  runtimeMax: number;

  /** Drop anything already watched, and anything already queued up. */
  hideWatched: boolean;
  hideSaved: boolean;

  mode: "simple" | "advanced";
};

export const DEFAULT_FILTERS: SmartFilters = {
  kind: "movie",
  // "Anything" rather than "Popular": an empty editor should not have already
  // made a choice on the user's behalf about which shelf to look at.
  source: "all",
  genres: [],
  providers: [],
  cast: [],
  certifications: [],
  statuses: [],
  scoreMin: 0,
  scoreMax: 100,
  decade: null,
  maxRuntime: null,
  yearMin: YEAR_FLOOR,
  yearMax: YEAR_CEILING,
  runtimeMin: RUNTIME_FLOOR,
  runtimeMax: RUNTIME_CEILING,
  hideWatched: false,
  hideSaved: false,
  mode: "simple",
};

/** The year window a set of filters actually asks for, whichever mode it is in. */
export function yearBounds(filters: SmartFilters): { from: number | null; to: number | null } {
  if (filters.mode === "advanced") {
    return {
      from: filters.yearMin > YEAR_FLOOR ? filters.yearMin : null,
      to: filters.yearMax < YEAR_CEILING ? filters.yearMax : null,
    };
  }

  if (filters.decade === null) return { from: null, to: null };
  return { from: filters.decade, to: filters.decade + 9 };
}

/** The same, for runtime, in minutes. */
export function runtimeBounds(filters: SmartFilters): { min: number | null; max: number | null } {
  if (filters.mode === "advanced") {
    return {
      min: filters.runtimeMin > RUNTIME_FLOOR ? filters.runtimeMin : null,
      // The top of the slider is "and up", not "exactly four hours".
      max: filters.runtimeMax < RUNTIME_CEILING ? filters.runtimeMax : null,
    };
  }

  return { min: null, max: filters.maxRuntime };
}

/**
 * Whether a set of filters says anything at all beyond "the popular films".
 * Used to keep the editor from offering to save an empty question.
 */
export function isNarrowed(filters: SmartFilters): boolean {
  const years = yearBounds(filters);
  const runtimes = runtimeBounds(filters);

  return (
    filters.genres.length > 0 ||
    filters.providers.length > 0 ||
    filters.cast.length > 0 ||
    filters.certifications.length > 0 ||
    filters.statuses.length > 0 ||
    filters.scoreMin > 0 ||
    filters.scoreMax < 100 ||
    years.from !== null ||
    years.to !== null ||
    runtimes.min !== null ||
    runtimes.max !== null ||
    filters.hideWatched ||
    filters.hideSaved ||
    filters.source !== DEFAULT_FILTERS.source ||
    filters.kind !== DEFAULT_FILTERS.kind
  );
}

/* -------------------------------------------------------------------------- */

const KINDS = new Set<SmartKind>(["movie", "tv", "both"]);
const SOURCE_VALUES = new Set<SmartSource>(SOURCES.map((s) => s.value));
const STATUS_VALUES = new Set<StatusSlug>(STATUSES.map((s) => s.value));

function clamp(value: unknown, low: number, high: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, Math.round(number)));
}

function strings(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const clean = value.filter((v): v is string => typeof v === "string");
  return allowed ? clean.filter((v) => allowed.has(v)) : clean;
}

/**
 * People out of a stored blob. A pick with no usable id is dropped rather than
 * repaired: an unnamed id would query correctly but leave the editor showing a
 * chip with nothing written on it.
 */
function castPicks(value: unknown): CastPick[] {
  if (!Array.isArray(value)) return [];

  const picks: CastPick[] = [];
  const seen = new Set<number>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { id, name } = entry as Record<string, unknown>;
    const numeric = Number(id);
    if (!Number.isInteger(numeric) || numeric <= 0 || seen.has(numeric)) continue;

    seen.add(numeric);
    picks.push({ id: numeric, name: typeof name === "string" && name ? name : `#${numeric}` });
  }

  return picks;
}

/**
 * Reads a stored blob back into filters, repairing whatever does not parse.
 *
 * Never throws: this runs on rows written by whatever version of the app the
 * user last saved with, and the list is far more useful slightly wrong than
 * gone. The one invariant enforced afterwards is that the sliders are the right
 * way round, since a min above its max silently returns nothing at all.
 */
export function parseFilters(raw: unknown): SmartFilters {
  let source: unknown = raw;

  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_FILTERS };
    }
  }

  if (!source || typeof source !== "object") return { ...DEFAULT_FILTERS };
  const input = source as Record<string, unknown>;

  const filters: SmartFilters = {
    kind: KINDS.has(input.kind as SmartKind) ? (input.kind as SmartKind) : DEFAULT_FILTERS.kind,
    source: SOURCE_VALUES.has(input.source as SmartSource)
      ? (input.source as SmartSource)
      : DEFAULT_FILTERS.source,
    genres: strings(input.genres),
    providers: Array.isArray(input.providers)
      ? input.providers.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [],
    cast: castPicks(input.cast),
    certifications: strings(input.certifications),
    statuses: strings(input.statuses, STATUS_VALUES as Set<string>) as StatusSlug[],
    scoreMin: clamp(input.scoreMin, 0, 100, 0),
    scoreMax: clamp(input.scoreMax, 0, 100, 100),
    decade:
      input.decade === null || input.decade === undefined
        ? null
        : DECADES.includes(Number(input.decade))
          ? Number(input.decade)
          : null,
    maxRuntime:
      input.maxRuntime === null || input.maxRuntime === undefined
        ? null
        : clamp(input.maxRuntime, 1, RUNTIME_CEILING, RUNTIME_CEILING),
    yearMin: clamp(input.yearMin, YEAR_FLOOR, YEAR_CEILING, YEAR_FLOOR),
    yearMax: clamp(input.yearMax, YEAR_FLOOR, YEAR_CEILING, YEAR_CEILING),
    runtimeMin: clamp(input.runtimeMin, RUNTIME_FLOOR, RUNTIME_CEILING, RUNTIME_FLOOR),
    runtimeMax: clamp(input.runtimeMax, RUNTIME_FLOOR, RUNTIME_CEILING, RUNTIME_CEILING),
    hideWatched: input.hideWatched === true,
    hideSaved: input.hideSaved === true,
    mode: input.mode === "advanced" ? "advanced" : "simple",
  };

  if (filters.scoreMin > filters.scoreMax) {
    [filters.scoreMin, filters.scoreMax] = [filters.scoreMax, filters.scoreMin];
  }
  if (filters.yearMin > filters.yearMax) {
    [filters.yearMin, filters.yearMax] = [filters.yearMax, filters.yearMin];
  }
  if (filters.runtimeMin > filters.runtimeMax) {
    [filters.runtimeMin, filters.runtimeMax] = [filters.runtimeMax, filters.runtimeMin];
  }

  return filters;
}

/**
 * A one-line description of what a list is asking for, shown under its name so
 * a rail of five smart lists is readable without opening any of them.
 */
export function describeFilters(filters: SmartFilters, genreLabel: (slug: string) => string): string {
  const parts: string[] = [];

  // "Anything" is the absence of a shelf, so saying it out loud would be noise
  // in a line whose whole job is to list what has actually been narrowed.
  if (filters.source !== "all") {
    parts.push(SOURCES.find((s) => s.value === filters.source)?.label ?? "Popular");
  }

  if (filters.genres.length > 0) parts.push(filters.genres.map(genreLabel).join(" + "));

  // Ahead of the medium, because "Bryan Cranston films" is how anyone would say
  // it out loud — the person is the subject, not another narrowing.
  if (filters.cast.length > 0) parts.push(filters.cast.map((person) => person.name).join(" + "));

  parts.push(filters.kind === "both" ? "films & shows" : filters.kind === "tv" ? "shows" : "films");

  const years = yearBounds(filters);
  if (years.from !== null && years.to !== null) {
    parts.push(years.to === years.from + 9 ? `${years.from}s` : `${years.from}–${years.to}`);
  } else if (years.from !== null) {
    parts.push(`${years.from} and later`);
  } else if (years.to !== null) {
    parts.push(`up to ${years.to}`);
  }

  if (filters.scoreMin > 0 || filters.scoreMax < 100) {
    parts.push(`${filters.scoreMin}–${filters.scoreMax}%`);
  }

  const runtimes = runtimeBounds(filters);
  if (runtimes.min !== null && runtimes.max !== null) {
    parts.push(`${runtimes.min}–${runtimes.max}m`);
  } else if (runtimes.max !== null) {
    parts.push(`under ${runtimes.max}m`);
  } else if (runtimes.min !== null) {
    parts.push(`over ${runtimes.min}m`);
  }

  return parts.join(" · ");
}
