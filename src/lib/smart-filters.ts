import { findGenre } from "./genres";
import { KNOWN_PROVIDERS } from "./providers";

/**
 * What a smart list asks, and how it reads back.
 *
 * Free of anything server-side: the editor is a client component and needs
 * the same type, defaults and parser as the code that runs the query
 * (`smart-query.ts` builds it, `smart-lists.ts` runs it). Stored as JSON on
 * `MediaList.filters`, so `parseFilters` must survive a blob written by an
 * older version of this file, including the current app's: it repairs rather
 * than rejects, because a list that has quietly lost a checkbox is far more
 * use than one that has stopped working.
 */

export type SmartKind = "movie" | "tv" | "both";

/**
 * The shelf the titles come off. "Anything" and "Popular" run the same query
 * bar one thing: popularity is a claim about audience size, so Popular carries
 * a vote floor and Anything does not. Trending is TMDB's own weekly ranking
 * and takes no filters at all; see `smart-query.ts`.
 */
export type SmartSource = "all" | "popular" | "trending" | "top-rated" | "upcoming" | "newest";

export const SOURCES: { value: SmartSource; label: string; blurb: string }[] = [
  { value: "all", label: "Anything", blurb: "The whole catalogue, however obscure." },
  { value: "popular", label: "Popular", blurb: "Titles with a real audience behind them." },
  { value: "trending", label: "Trending", blurb: "Moving fastest this week. Takes no length or service filter." },
  { value: "top-rated", label: "Top rated", blurb: "Best scored, with enough votes to mean it." },
  { value: "upcoming", label: "Upcoming", blurb: "Not out yet, soonest first." },
  { value: "newest", label: "Newest", blurb: "Most recently released." },
];

export const KINDS: { value: SmartKind; label: string }[] = [
  { value: "movie", label: "Films" },
  { value: "tv", label: "Shows" },
  { value: "both", label: "Both" },
];

/**
 * Production status: a film is out or not, a series has five states. Both
 * vocabularies share one control, and the query builder applies each to the
 * half of the search it means something for.
 */
export type StatusSlug = "released" | "unreleased" | "returning" | "planned" | "in-production" | "ended" | "cancelled";

export const STATUSES: { value: StatusSlug; label: string; applies: "movie" | "tv" }[] = [
  { value: "released", label: "Released", applies: "movie" },
  { value: "unreleased", label: "Not out yet", applies: "movie" },
  { value: "returning", label: "Returning series", applies: "tv" },
  { value: "planned", label: "Planned", applies: "tv" },
  { value: "in-production", label: "In production", applies: "tv" },
  { value: "ended", label: "Ended", applies: "tv" },
  { value: "cancelled", label: "Cancelled", applies: "tv" },
];

/** Whether a status describes this medium at all. */
export function statusApplies(slug: StatusSlug, mediaType: "movie" | "tv"): boolean {
  return STATUSES.find((s) => s.value === slug)?.applies === mediaType;
}

/** The statuses the editor offers for a kind: both vocabularies, each marked, when it is both. */
export function statusesFor(kind: SmartKind) {
  return STATUSES.filter((s) => kind === "both" || s.applies === kind);
}

/**
 * The filters with a new kind, less any status that does not exist for it.
 * "Released" is a film's state and "Ended" a show's; one left behind by a
 * switch from films to shows would say "Released" on the folded header while
 * the query quietly drops the shows half for want of a status that fits it.
 * Both keeps them all, since both vocabularies are offered there.
 */
export function withKind(f: SmartFilters, kind: SmartKind): SmartFilters {
  const offered = new Set(statusesFor(kind).map((s) => s.value));
  return { ...f, kind, statuses: f.statuses.filter((s) => offered.has(s)) };
}

/** TMDB's `with_status` numbers for television. Films have no equivalent. */
export const TV_STATUS_CODES: Partial<Record<StatusSlug, number>> = {
  returning: 0,
  planned: 1,
  "in-production": 2,
  ended: 3,
  cancelled: 4,
};

/**
 * Certificates by the board TMDB is asked about, which is the viewer's region.
 * TMDB carries them for films only. An unknown region falls back to the
 * American board, the one TMDB's data is most complete for.
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

/** Simple mode's decades. */
export const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];
/** Simple mode's upper lengths, in minutes. */
export const MAX_LENGTHS = [90, 120, 150, 180];

/** The advanced sliders' bounds. The top of each means "and up", not a limit. */
export const YEAR_FLOOR = 1950;
export const YEAR_CEILING = new Date().getFullYear() + 1;
export const RUNTIME_CEILING = 180;

/** Someone a list insists on. The name is stored so nothing has to look it up to say who. */
export type CastPick = { id: number; name: string };

export type SmartFilters = {
  kind: SmartKind;
  source: SmartSource;
  /** Genre slugs from `GENRES`. Every one of them must match. */
  genres: string[];
  /** Service ids from `KNOWN_PROVIDERS`; any one of them will do. */
  providers: number[];
  /** People who must be in it, all of them. Films only: TMDB has no such filter for television. */
  cast: CastPick[];
  /** Certificates on the viewer's region's board. Films only. */
  certifications: string[];
  statuses: StatusSlug[];
  /** Audience score as a percentage, as the app shows it everywhere. */
  scoreMin: number;
  scoreMax: number;
  /**
   * Simple mode: a decade and an upper length. Advanced mode ignores both for
   * the sliders below. Kept apart rather than derived from each other, so that
   * switching modes and back never rewrites an answer already given.
   */
  decade: number | null;
  maxRuntime: number | null;
  yearMin: number;
  yearMax: number;
  runtimeMin: number;
  runtimeMax: number;
  hideWatched: boolean;
  hideSaved: boolean;
  mode: "simple" | "advanced";
};

export const DEFAULT_FILTERS: SmartFilters = {
  kind: "movie",
  // An empty editor should not have chosen a shelf on anyone's behalf.
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
  runtimeMin: 0,
  runtimeMax: RUNTIME_CEILING,
  hideWatched: false,
  hideSaved: false,
  mode: "simple",
};

/** The years a set of filters asks for, whichever mode it is in. Null is open. */
export function yearBounds(f: SmartFilters): { from: number | null; to: number | null } {
  if (f.mode === "advanced") {
    return { from: f.yearMin > YEAR_FLOOR ? f.yearMin : null, to: f.yearMax < YEAR_CEILING ? f.yearMax : null };
  }
  return f.decade === null ? { from: null, to: null } : { from: f.decade, to: f.decade + 9 };
}

/** The same for length, in minutes. */
export function runtimeBounds(f: SmartFilters): { min: number | null; max: number | null } {
  if (f.mode === "advanced") {
    return { min: f.runtimeMin > 0 ? f.runtimeMin : null, max: f.runtimeMax < RUNTIME_CEILING ? f.runtimeMax : null };
  }
  return { min: null, max: f.maxRuntime };
}

// ---------------------------------------------------------------------------
// Reading a stored blob

const KIND_VALUES = new Set<string>(KINDS.map((k) => k.value));
const SOURCE_VALUES = new Set<string>(SOURCES.map((s) => s.value));
const STATUS_VALUES = new Set<string>(STATUSES.map((s) => s.value));

function clamp(value: unknown, low: number, high: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(high, Math.max(low, Math.round(n)));
}

function strings(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const clean = [...new Set(value.filter((v): v is string => typeof v === "string"))];
  return allowed ? clean.filter((v) => allowed.has(v)) : clean;
}

/** A pick with no usable id is dropped rather than repaired: a nameless chip says nothing. */
function castPicks(value: unknown): CastPick[] {
  if (!Array.isArray(value)) return [];
  const out: CastPick[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { id, name } = entry as Record<string, unknown>;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0 || out.some((p) => p.id === n)) continue;
    out.push({ id: n, name: typeof name === "string" && name ? name.slice(0, 80) : `#${n}` });
  }
  return out.slice(0, 5);
}

/**
 * A stored blob, or the editor's state on its way to the server, as filters.
 * Never throws. The one invariant enforced afterwards is that each range is the
 * right way round, since a minimum above its maximum quietly matches nothing.
 */
export function parseFilters(raw: unknown): SmartFilters {
  let source = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_FILTERS };
    }
  }
  if (!source || typeof source !== "object") return { ...DEFAULT_FILTERS };
  const i = source as Record<string, unknown>;

  const f: SmartFilters = {
    kind: KIND_VALUES.has(i.kind as string) ? (i.kind as SmartKind) : DEFAULT_FILTERS.kind,
    source: SOURCE_VALUES.has(i.source as string) ? (i.source as SmartSource) : DEFAULT_FILTERS.source,
    genres: strings(i.genres).filter((slug) => findGenre(slug)),
    providers: Array.isArray(i.providers)
      ? [...new Set(i.providers.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [],
    cast: castPicks(i.cast),
    certifications: strings(i.certifications).slice(0, 10),
    statuses: strings(i.statuses, STATUS_VALUES) as StatusSlug[],
    scoreMin: clamp(i.scoreMin, 0, 100, 0),
    scoreMax: clamp(i.scoreMax, 0, 100, 100),
    decade: DECADES.includes(Number(i.decade)) && i.decade !== null ? Number(i.decade) : null,
    maxRuntime:
      i.maxRuntime === null || i.maxRuntime === undefined ? null : clamp(i.maxRuntime, 1, RUNTIME_CEILING, RUNTIME_CEILING),
    yearMin: clamp(i.yearMin, YEAR_FLOOR, YEAR_CEILING, YEAR_FLOOR),
    yearMax: clamp(i.yearMax, YEAR_FLOOR, YEAR_CEILING, YEAR_CEILING),
    runtimeMin: clamp(i.runtimeMin, 0, RUNTIME_CEILING, 0),
    runtimeMax: clamp(i.runtimeMax, 0, RUNTIME_CEILING, RUNTIME_CEILING),
    hideWatched: i.hideWatched === true,
    hideSaved: i.hideSaved === true,
    mode: i.mode === "advanced" ? "advanced" : "simple",
  };
  if (f.scoreMin > f.scoreMax) [f.scoreMin, f.scoreMax] = [f.scoreMax, f.scoreMin];
  if (f.yearMin > f.yearMax) [f.yearMin, f.yearMax] = [f.yearMax, f.yearMin];
  if (f.runtimeMin > f.runtimeMax) [f.runtimeMin, f.runtimeMax] = [f.runtimeMax, f.runtimeMin];
  // A blob saved before the editor cleared them may hold a status the kind has no use for.
  return withKind(f, f.kind);
}

// ---------------------------------------------------------------------------
// Reading it back

/** "90 m", "2 h", "2 h 30 m": the editor's way of saying a length. */
export function lengthLabel(minutes: number): string {
  if (minutes <= 0) return "0";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}

function joined(words: string[], last: "and" | "or") {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${last} ${words[words.length - 1]}`;
}

export const kindLabel = (kind: SmartKind) => (kind === "both" ? "Films and shows" : kind === "tv" ? "Shows" : "Films");
const genreLabel = (slug: string) => findGenre(slug)?.label ?? slug;
const providerName = (id: number) => KNOWN_PROVIDERS.find((p) => p.id === id)?.name ?? `Service ${id}`;
const statusLabel = (slug: StatusSlug) => STATUSES.find((s) => s.value === slug)?.label ?? slug;

const SOURCE_PHRASE: Record<SmartSource, string | null> = {
  all: null,
  popular: "popular",
  trending: "trending this week",
  "top-rated": "top rated",
  upcoming: "not out yet",
  newest: "newly out",
};

/** One piece of the readback; the bold ones are what was chosen. */
export type Phrase = { text: string; strong?: boolean };

/**
 * The whole question as one sentence, which is what you check before saving
 * rather than re-reading six sections: "Films and shows that are popular,
 * tagged horror and thriller, on Netflix, rated 70% or better, from 2015
 * onwards. Leaves out what you have seen."
 */
export function sentence(f: SmartFilters): Phrase[] {
  const out: Phrase[] = [{ text: kindLabel(f.kind), strong: true }];
  const clauses: Phrase[][] = [];
  const add = (lead: string, chosen: string, tail = "") => clauses.push([{ text: lead }, { text: chosen, strong: true }, ...(tail ? [{ text: tail }] : [])]);

  const shelf = SOURCE_PHRASE[f.source];
  if (shelf) add("that are ", shelf);
  if (f.genres.length) add("tagged ", joined(f.genres.map((g) => genreLabel(g).toLowerCase()), "and"));
  if (f.cast.length) add("with ", joined(f.cast.map((p) => p.name), "and"));
  if (f.providers.length) add("on ", joined(f.providers.map(providerName), "or"));
  if (f.statuses.length) add("", joined(f.statuses.map((s) => statusLabel(s).toLowerCase()), "or"));
  if (f.certifications.length) add("certificate ", joined(f.certifications, "or"));

  if (f.scoreMin > 0 && f.scoreMax < 100) add("rated ", `${f.scoreMin}–${f.scoreMax}%`);
  else if (f.scoreMin > 0) add("rated ", `${f.scoreMin}% or better`);
  else if (f.scoreMax < 100) add("rated ", `${f.scoreMax}% or lower`);

  const years = yearBounds(f);
  if (years.from !== null && years.to !== null) {
    if (f.mode === "simple") add("from the ", `${years.from}s`);
    else add("from ", years.from === years.to ? `${years.from}` : `${years.from} to ${years.to}`);
  } else if (years.from !== null) add("from ", `${years.from} onwards`);
  else if (years.to !== null) add("from ", `${years.to} or earlier`);

  const length = runtimeBounds(f);
  if (length.min !== null && length.max !== null) add("", `${lengthLabel(length.min)} to ${lengthLabel(length.max)}`, " long");
  else if (length.max !== null) add("", `under ${lengthLabel(length.max)}`);
  else if (length.min !== null) add("", `over ${lengthLabel(length.min)}`);

  clauses.forEach((clause, index) => {
    // The first clause follows the subject with a space; later ones with a comma.
    out.push({ text: index === 0 ? " " : ", " }, ...clause);
  });
  out.push({ text: "." });

  const leaves = [f.hideWatched && "what you have seen", f.hideSaved && "what is already on a list"].filter(
    (s): s is string => Boolean(s),
  );
  if (leaves.length) out.push({ text: ` Leaves out ${leaves.join(" and ")}.` });
  return out;
}

/** What each folded section holds, for its closed header. */
export function foldSummaries(f: SmartFilters) {
  const source = SOURCES.find((s) => s.value === f.source)?.label ?? "Anything";
  return {
    what: `${kindLabel(f.kind)} · ${source.toLowerCase()}`,
    genre: f.genres.length ? f.genres.map(genreLabel).join(", ") : "Any",
    services: f.providers.length ? f.providers.map(providerName).join(", ") : "Any",
    people: f.cast.length ? f.cast.map((p) => p.name).join(", ") : "Anyone",
    status: f.statuses.length ? f.statuses.map(statusLabel).join(", ") : "Any",
    certificate: f.certifications.length ? f.certifications.join(", ") : "Any",
  };
}
