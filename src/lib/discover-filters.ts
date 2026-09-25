import { findGenre } from "./genres";
import { KNOWN_PROVIDERS } from "./providers";
import {
  DEFAULT_FILTERS,
  RUNTIME_CEILING,
  YEAR_CEILING,
  YEAR_FLOOR,
  type SmartFilters,
  type SmartSource,
} from "./smart-filters";

/**
 * The filter page's state, and its address. Pure, because the page reads it
 * on the server and the panel writes it in the browser, and both have to
 * agree on every key.
 *
 * Everything lives in the query string, so a set of filters is a link and the
 * page stays a server component. Defaults are left out of the address, so a
 * plain `/discover/filters` is the unfiltered catalogue and a shared link only
 * says what was chosen. What it asks is the smart list builder's question
 * (`toSmartFilters`), so "horror, 70% or better" means the same here as in a
 * smart list.
 */

export type FilterType = "all" | "movie" | "tv";
export type FilterSort = "popular" | "top-rated" | "newest";

export const FILTER_SORTS: { value: FilterSort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "top-rated", label: "Best rated" },
  { value: "newest", label: "Newest" },
];

export type FilterState = {
  type: FilterType;
  sort: FilterSort;
  genres: string[];
  providers: number[];
  scoreMin: number;
  scoreMax: number;
  yearMin: number;
  yearMax: number;
  runtimeMin: number;
  runtimeMax: number;
  hideWatched: boolean;
  hideSaved: boolean;
};

export const DEFAULT_FILTER_STATE: FilterState = {
  type: "all",
  sort: "popular",
  genres: [],
  providers: [],
  scoreMin: 0,
  scoreMax: 100,
  yearMin: YEAR_FLOOR,
  yearMax: YEAR_CEILING,
  runtimeMin: 0,
  runtimeMax: RUNTIME_CEILING,
  hideWatched: false,
  hideSaved: false,
};

type Search = Record<string, string | string[] | undefined>;

const one = (search: Search, key: string) => {
  const v = search[key];
  return Array.isArray(v) ? v[0] : v;
};

/** "60-90" as a pair inside the bounds, the right way round; anything else is the default. */
function range(value: string | undefined, low: number, high: number, fallback: [number, number]): [number, number] {
  const m = value?.match(/^(\d+)-(\d+)$/);
  if (!m) return fallback;
  const clamp = (n: number) => Math.min(high, Math.max(low, n));
  const a = clamp(Number(m[1]));
  const b = clamp(Number(m[2]));
  return a <= b ? [a, b] : [b, a];
}

const KNOWN_IDS = new Set(KNOWN_PROVIDERS.map((p) => p.id));

/**
 * The address as filters. Never throws: a hand-edited or out-of-date link is
 * repaired to what it can still mean, as a stored smart list is.
 */
export function readFilterQuery(search: Search): FilterState {
  const d = DEFAULT_FILTER_STATE;
  const type = one(search, "type");
  const sort = one(search, "sort");
  const list = (key: string) => (one(search, key) ?? "").split(",").filter(Boolean);
  const [scoreMin, scoreMax] = range(one(search, "score"), 0, 100, [d.scoreMin, d.scoreMax]);
  const [yearMin, yearMax] = range(one(search, "years"), YEAR_FLOOR, YEAR_CEILING, [d.yearMin, d.yearMax]);
  const [runtimeMin, runtimeMax] = range(one(search, "length"), 0, RUNTIME_CEILING, [d.runtimeMin, d.runtimeMax]);
  return {
    type: type === "movie" || type === "tv" ? type : "all",
    sort: FILTER_SORTS.some((s) => s.value === sort) ? (sort as FilterSort) : d.sort,
    genres: [...new Set(list("genre"))].filter((slug) => findGenre(slug)),
    providers: [...new Set(list("service").map(Number))].filter((id) => KNOWN_IDS.has(id)),
    scoreMin,
    scoreMax,
    yearMin,
    yearMax,
    runtimeMin,
    runtimeMax,
    hideWatched: one(search, "unseen") === "1",
    hideSaved: one(search, "unlisted") === "1",
  };
}

/** The filters as a query string, defaults left out, in a fixed order. `page` only past the first. */
export function filterQuery(state: FilterState, page = 1): string {
  const d = DEFAULT_FILTER_STATE;
  const p = new URLSearchParams();
  if (state.type !== d.type) p.set("type", state.type);
  if (state.sort !== d.sort) p.set("sort", state.sort);
  if (state.genres.length) p.set("genre", state.genres.join(","));
  if (state.providers.length) p.set("service", state.providers.join(","));
  if (state.scoreMin !== d.scoreMin || state.scoreMax !== d.scoreMax) p.set("score", `${state.scoreMin}-${state.scoreMax}`);
  if (state.yearMin !== d.yearMin || state.yearMax !== d.yearMax) p.set("years", `${state.yearMin}-${state.yearMax}`);
  if (state.runtimeMin !== d.runtimeMin || state.runtimeMax !== d.runtimeMax) p.set("length", `${state.runtimeMin}-${state.runtimeMax}`);
  if (state.hideWatched) p.set("unseen", "1");
  if (state.hideSaved) p.set("unlisted", "1");
  if (page > 1) p.set("page", String(page));
  // Commas read better in an address than %2C, and mean nothing else here.
  return p.toString().replace(/%2C/g, ",");
}

export const FILTER_PATH = "/discover/filters";

export function filterHref(state: FilterState, page = 1) {
  const q = filterQuery(state, page);
  return q ? `${FILTER_PATH}?${q}` : FILTER_PATH;
}

/** Whether anything differs from the unfiltered catalogue, for Reset. */
export function isFiltered(state: FilterState) {
  return filterQuery(state) !== "";
}

const SOURCE_FOR: Record<FilterSort, SmartSource> = { popular: "popular", "top-rated": "top-rated", newest: "newest" };

/**
 * The same question as a smart list, in Advanced mode so the sliders are
 * read as they stand. Popular and Best rated carry the smart list's vote
 * floor, which keeps the four-vote tens out of a list meant for browsing.
 */
export function toSmartFilters(state: FilterState): SmartFilters {
  return {
    ...DEFAULT_FILTERS,
    kind: state.type === "all" ? "both" : state.type,
    source: SOURCE_FOR[state.sort],
    genres: state.genres,
    providers: state.providers,
    scoreMin: state.scoreMin,
    scoreMax: state.scoreMax,
    yearMin: state.yearMin,
    yearMax: state.yearMax,
    runtimeMin: state.runtimeMin,
    runtimeMax: state.runtimeMax,
    hideWatched: state.hideWatched,
    hideSaved: state.hideSaved,
    mode: "advanced",
  };
}
