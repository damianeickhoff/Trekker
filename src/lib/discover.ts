import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { findGenre, type Genre } from "./genres";
import { titleKey } from "./marks";
import { toSmartFilters, type FilterState } from "./discover-filters";
import { DEFAULT_FILTERS } from "./smart-filters";
import { viewerSets } from "./smart-lists";
import { discoverParams, genresWithoutTv, leaveOut, mediumApplies } from "./smart-query";
import {
  cacheKey,
  discover,
  normalise,
  tmdbGet,
  tmdbPeek,
  type ListItem,
  type MediaType,
  type TmdbListItem,
} from "./tmdb";

/**
 * Discover's reads. Every rail is one TMDB answer kept in `TmdbCache` for an
 * hour (the trending lifetime), so the page costs a handful of requests an
 * hour for the whole instance and database reads the rest of the time. What
 * is personal, the ticks and the marks, is rows.
 *
 * The Everything / Shows / Films filter reshapes the page rather than hiding
 * rows: narrowing it skips the requests it cannot use (`discoverPlan`).
 */

export type DiscoverType = "all" | MediaType;

export function parseType(value: string | string[] | undefined): DiscoverType {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "tv" || v === "movie" ? v : "all";
}

/** `?page=`, as a TMDB page: 1 to 500, anything else is the first. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 1;
}

/** `?type=tv` carried onto a link, or nothing for Everything. */
export function withType(href: string, type: DiscoverType, extra: Record<string, string | number | undefined> = {}) {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") params.set(k, String(v));
  const q = params.toString();
  return q ? `${href}?${q}` : href;
}

export type CategorySlug =
  | "trending"
  | "in-cinemas"
  | "popular-tv"
  | "popular-movies"
  | "new-shows"
  | "upcoming"
  | "upcoming-tv"
  | "top-rated-movies"
  | "top-rated-tv";

type Category = {
  title: string;
  blurb: string;
  /** The medium it lists; null follows the page's filter (Trending). */
  medium: MediaType | null;
  request: (ctx: Context) => { path: string; params: Record<string, string> };
  /** An order of its own, for a list TMDB ranks by something else. Applied a page at a time. */
  order?: (a: TmdbListItem, b: TmdbListItem) => number;
};

type Context = { type: DiscoverType; region: string; today: string };

export const CATEGORIES: Record<CategorySlug, Category> = {
  trending: {
    title: "Trending",
    blurb: "What everyone is watching this week",
    medium: null,
    request: ({ type }) => ({ path: `/trending/${type}/week`, params: {} }),
  },
  "in-cinemas": {
    title: "In cinemas now",
    blurb: "On a screen bigger than yours",
    medium: "movie",
    request: ({ region }) => ({ path: "/movie/now_playing", params: { region } }),
  },
  "popular-tv": {
    title: "Popular shows",
    blurb: "The series pulling the biggest audiences",
    medium: "tv",
    request: () => ({ path: "/tv/popular", params: {} }),
  },
  "popular-movies": {
    title: "Popular films",
    blurb: "The films drawing the biggest audiences",
    medium: "movie",
    request: () => ({ path: "/movie/popular", params: {} }),
  },
  "new-shows": {
    title: "New shows",
    blurb: "On the air this week, newest first",
    medium: "tv",
    // TMDB's on-the-air list, which already holds everything airing today,
    // ranks by popularity: a thirtieth season of a soap first. Newest first
    // is what makes it a list of new shows. TMDB cannot sort it, so each page
    // is sorted as it arrives.
    request: () => ({ path: "/tv/on_the_air", params: {} }),
    order: (a, b) => (b.first_air_date ?? "").localeCompare(a.first_air_date ?? ""),
  },
  upcoming: {
    title: "Coming soon in cinemas",
    blurb: "Films with a release date still ahead",
    medium: "movie",
    request: ({ region }) => ({ path: "/movie/upcoming", params: { region } }),
  },
  "upcoming-tv": {
    title: "Upcoming shows",
    blurb: "Series that have not premiered yet",
    medium: "tv",
    // TMDB has no upcoming list for television, so: first air date ahead,
    // most talked about first. Soonest first is a list of pilots nobody has
    // heard of.
    request: ({ today }) => ({
      path: "/discover/tv",
      params: { sort_by: "popularity.desc", "first_air_date.gte": today },
    }),
  },
  "top-rated-movies": {
    title: "Highest rated films",
    blurb: "By everyone who bothered to vote",
    medium: "movie",
    request: () => ({ path: "/movie/top_rated", params: {} }),
  },
  "top-rated-tv": {
    title: "Highest rated shows",
    blurb: "By everyone who bothered to vote",
    medium: "tv",
    request: () => ({ path: "/tv/top_rated", params: {} }),
  },
};

export function isCategory(slug: string): slug is CategorySlug {
  return Object.hasOwn(CATEGORIES, slug);
}

/**
 * What the Discover page asks for under each filter, by tier. Films only has
 * no use for a show's list and the other way round, so neither is fetched:
 * the billboard row becomes the most watched series on Shows, where there is
 * no cinema listing to show, and the Popular shows rail then stands down
 * rather than repeat it. "Things you may like" is personal and follows the
 * filter itself (`fetchForYou`).
 */
export function discoverPlan(type: DiscoverType) {
  const films = type !== "tv";
  const shows = type !== "movie";
  return {
    trending: "trending" as const,
    billboard: (type === "tv" ? "popular-tv" : "in-cinemas") as CategorySlug,
    rails: [shows && type !== "tv" && "popular-tv", films && "popular-movies", shows && "new-shows"].filter(Boolean) as CategorySlug[],
    horizon: [shows && "upcoming-tv", films && "upcoming"].filter(Boolean) as CategorySlug[],
    hallOfFame: [films && "top-rated-movies", shows && "top-rated-tv"].filter(Boolean) as CategorySlug[],
  };
}

/** A chip in the row of categories on Discover and on each category's page. */
export type CategoryHop = { id: string; label: string; href: string; covers: string[] };

/**
 * The row of categories, one chip for each of Discover's rails, in the order
 * the page draws them, carrying the filter. A chip the filter leaves empty is
 * left out, as its rail is: no Popular films on Shows. On the horizon and the
 * hall of fame are each two categories, a medium apiece; the chip opens the
 * first the page draws under the filter, and stands lit on either. `covers` is
 * what counts as being on it: category slugs, or "for-you".
 */
export function categoryHops(type: DiscoverType): CategoryHop[] {
  const plan = discoverPlan(type);
  const films = type !== "tv";
  const shows = type !== "movie";
  const hop = (id: string, label: string, covers: string[]): CategoryHop => ({
    id,
    label,
    href: withType(`/discover/${covers[0]}`, type),
    covers,
  });
  return [
    hop("trending", "Trending", ["trending"]),
    hop("for-you", "Things you may like", ["for-you"]),
    shows && hop("popular-tv", "Popular shows", ["popular-tv"]),
    films && hop("popular-movies", "Popular films", ["popular-movies"]),
    shows && hop("new-shows", "New shows", ["new-shows"]),
    films && hop("in-cinemas", "In cinemas", ["in-cinemas"]),
    hop("horizon", "On the horizon", plan.horizon),
    hop("hall-of-fame", "Hall of fame", plan.hallOfFame),
  ].filter((h): h is CategoryHop => Boolean(h));
}

type Paged = { page: number; results: TmdbListItem[]; total_pages: number; total_results?: number };

/** `total` is TMDB's count of the whole list, where it gives one. */
export type CategoryPage = { items: ListItem[]; page: number; totalPages: number; total: number };

/**
 * One page of a category, through the cache with the trending lifetime. Page
 * one carries no page parameter, so the rail on Discover and the first page of
 * the category are one cache row.
 */
export async function fetchCategory(slug: CategorySlug, ctx: Context, page = 1): Promise<CategoryPage> {
  const category = CATEGORIES[slug];
  const { path, params } = category.request(ctx);
  const data = await tmdbGet<Paged>("trending", path, { ...params, page: page > 1 ? page : undefined });
  const fallback = category.medium ?? (ctx.type === "all" ? undefined : ctx.type);
  const items = (category.order ? [...data.results].sort(category.order) : data.results)
    .map((r) => normalise(r, fallback))
    .filter((i): i is ListItem => i !== null);
  // TMDB refuses pages past 500.
  return { items, page: data.page, totalPages: Math.min(data.total_pages || 1, TMDB_LAST), total: data.total_results ?? 0 };
}

/** A category that failed and has nothing cached is an empty rail, not a broken page. */
export function tryCategory(slug: CategorySlug, ctx: Context, page = 1): Promise<CategoryPage | null> {
  return fetchCategory(slug, ctx, page).catch(() => null);
}

/**
 * One page of a category's grid: `GRID_PAGE` titles, from the one or two
 * TMDB pages they span, each through the cache, so the first of them is the
 * Discover rail's own row. Null when TMDB failed with nothing cached.
 */
export async function tryCategoryGrid(slug: CategorySlug, ctx: Context, page: number): Promise<CategoryPage | null> {
  const read = await readWindow(page, GRID_PAGE, (p) => fetchCategory(slug, ctx, p)).catch(() => null);
  return read && { items: read.items, page, totalPages: gridPages(read.total, GRID_PAGE), total: read.total };
}

// ---------------------------------------------------------------------------
// Grid pages

/**
 * Titles to a page on the grid pages (a category, a genre, the filter page and
 * Things you may like): four rows of six on desktop, eight of three on phones.
 * TMDB's own pages are twenty, so a grid page is a window across one or two of
 * them rather than one of them.
 */
export const GRID_PAGE = 24;
const TMDB_PAGE = 20;
/** TMDB refuses pages past this. */
const TMDB_LAST = 500;

/**
 * Where the `page`th window of `per` titles lies in a TMDB list: the TMDB pages
 * it starts and ends on, and how many of the first to skip. Every window
 * follows the last with nothing skipped or repeated. Pure, for the tests.
 */
export function gridWindow(page: number, per: number) {
  const start = (page - 1) * per;
  const first = Math.floor(start / TMDB_PAGE) + 1;
  const last = Math.floor((start + per - 1) / TMDB_PAGE) + 1;
  return { first, last, skip: start - (first - 1) * TMDB_PAGE };
}

/** How many windows of `per` a list of `total` titles fills, no further than TMDB will go. */
export function gridPages(total: number, per: number) {
  return Math.max(1, Math.ceil(Math.min(total, TMDB_LAST * TMDB_PAGE) / per));
}

type ListPage = { items: ListItem[]; totalPages: number; total: number };

/**
 * One window of a TMDB list, read a page at a time through `get`: the second
 * page only when the window runs into it and the list has one, so the end of
 * a list costs no request for an empty page. `total` falls back to the page
 * count where TMDB gives no count.
 */
async function readWindow(page: number, per: number, get: (tmdbPage: number) => Promise<ListPage>) {
  const w = gridWindow(page, per);
  if (w.first > TMDB_LAST) return { items: [], total: 0 };
  const head = await get(w.first);
  const tail = w.last > w.first && w.last <= Math.min(head.totalPages, TMDB_LAST) ? await get(w.last) : null;
  const items = [...head.items, ...(tail?.items ?? [])].slice(w.skip, w.skip + per);
  return { items, total: head.total || head.totalPages * TMDB_PAGE };
}

/** Two windows, a place from each in turn, so a mixed page is not all films and then all shows. */
function interleave(lists: ListItem[][]) {
  const out: ListItem[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/** A discover query's page in the shape `readWindow` reads. */
function discoverPage(medium: MediaType, params: Record<string, string>) {
  return (p: number) =>
    discover(medium, { ...params, page: p > 1 ? p : undefined }).then((r) => ({ items: r.items, totalPages: r.totalPages, total: r.totalResults }));
}

// ---------------------------------------------------------------------------
// Genres

/**
 * The order the tiles come in: the mockup's eight first, the rest after.
 * Tints are the mockups' poster tints, for a tile whose artwork is missing and
 * for the wash over the ones that have it.
 */
const TILE_ORDER: [slug: string, tint: string][] = [
  ["horror", "#B3121A"],
  ["comedy", "#D62A7A"],
  ["action", "#5A6270"],
  ["sci-fi", "#3D5A45"],
  ["thriller", "#2A3340"],
  ["drama", "#4C7FA8"],
  ["crime", "#1F6B78"],
  ["family", "#2A6EA6"],
  ["mystery", "#2A3340"],
  ["fantasy", "#3D5A45"],
  ["adventure", "#C9661B"],
  ["animation", "#D9491F"],
  ["documentary", "#5A6270"],
  ["romance", "#D62A7A"],
];

/** The tile is wide, so the chosen title's backdrop is drawn when it has one and its poster, cropped, when not. */
export type GenreTileData = { slug: string; label: string; tint: string; poster: string | null; backdrop: string | null };

/** The genres a filter can open: on Shows, only those television has an equivalent for. */
export function tileGenres(type: DiscoverType): (Genre & { tint: string })[] {
  return TILE_ORDER.map(([slug, tint]) => ({ ...findGenre(slug)!, tint })).filter(
    (g) => type !== "tv" || g.tvId !== null,
  );
}

/** A genre page's query for one medium, or null when the genre has no such half. Shared with the tile artwork, so both read one cache row. */
export function genreParams(slug: string, medium: MediaType, today: string) {
  return discoverParams({ ...DEFAULT_FILTERS, kind: medium, genres: [slug] }, medium, { region: "", today });
}

/**
 * Artwork for each tile, from the cache only. First choice: the first poster
 * of the genre's own page, when somebody has opened it. Otherwise a title of
 * that genre among what the page has already loaded (trending and the rest).
 * No tile shares a poster with another, and a tile with none keeps its tint.
 * Never the network: fourteen discover requests to decorate a row of links is
 * the fan-out this page exists to avoid.
 */
export async function genreArtwork(type: DiscoverType, today: string, loaded: ListItem[]): Promise<GenreTileData[]> {
  const genres = tileGenres(type);
  const medium: MediaType = type === "tv" ? "tv" : "movie";
  const cached = await Promise.all(
    genres.map((g) => {
      const params = genreParams(g.slug, medium, today);
      return params ? tmdbPeek<Paged>(`/discover/${medium}`, params) : null;
    }),
  );
  return pickGenreArt(
    genres,
    cached.map((c) => (c?.results ?? []).map((r) => normalise(r, medium)).filter((i): i is ListItem => i !== null)),
    loaded,
  );
}

/** Pure half of `genreArtwork`, for the tests. */
export function pickGenreArt(
  genres: (Genre & { tint: string })[],
  own: ListItem[][],
  loaded: ListItem[],
): GenreTileData[] {
  const used = new Set<string>();
  return genres.map((g, i) => {
    const matches = (item: ListItem) => item.genreIds.includes(item.mediaType === "movie" ? g.movieId : (g.tvId ?? -1));
    const pick = [...own[i], ...loaded.filter(matches)].find((item) => item.poster && !used.has(item.poster));
    if (pick?.poster) used.add(pick.poster);
    return { slug: g.slug, label: g.label, tint: g.tint, poster: pick?.poster ?? null, backdrop: pick?.backdrop ?? null };
  });
}

export type GenrePage = {
  items: ListItem[];
  page: number;
  totalPages: number;
  /** The genre has no television half, so a Shows or Everything view is films only. */
  filmsOnly: boolean;
};

/**
 * A genre's page, narrowed to films or shows, one discover query per medium
 * through the smart list builder: "horror" means here what it means in a
 * smart list, and a genre television has no equivalent for drops the shows
 * half rather than listing unrelated shows. A page is `GRID_PAGE` titles,
 * split evenly between the halves and interleaved, so a mixed view is not all
 * films and then all shows.
 */
export async function fetchGenre(slug: string, type: DiscoverType, page: number, today: string): Promise<GenrePage | null> {
  const genre = findGenre(slug);
  if (!genre) return null;
  const f = { ...DEFAULT_FILTERS, genres: [slug] };
  const halves = (["movie", "tv"] as const).filter(
    (m) => (type === "all" || type === m) && mediumApplies({ ...f, kind: m }, m),
  );
  const per = GRID_PAGE / Math.max(1, halves.length);
  // At most two halves, so this fan-out is bounded by the list above.
  const results = await Promise.all(
    halves.map((m) => readWindow(page, per, discoverPage(m, genreParams(slug, m, today)!)).catch(() => null)),
  );
  if (halves.length && results.every((r) => r === null)) return null;

  return {
    items: interleave(results.map((r) => r?.items ?? [])),
    page,
    totalPages: Math.max(1, ...results.map((r) => gridPages(r?.total ?? 0, per))),
    filmsOnly: type !== "movie" && genresWithoutTv(f).length > 0,
  };
}

// ---------------------------------------------------------------------------
// Ticks

/**
 * Which of these titles this person has seen: a film watched, or a show begun.
 * Two `IN (...)` queries over the watched tables, whatever the number of rails.
 */
export async function seenAmong(userId: string, items: { mediaType: MediaType; id: number }[]): Promise<Set<string>> {
  const ids = (m: MediaType) => [...new Set(items.filter((i) => i.mediaType === m).map((i) => i.id))];
  const films = ids("movie");
  const shows = ids("tv");
  const [watchedFilms, begunShows] = await Promise.all([
    films.length
      ? db.watchedMovie.findMany({ where: { userId, movieId: { in: films } }, select: { movieId: true } })
      : [],
    shows.length
      ? db.watchedEpisode.findMany({
          where: { userId, showId: { in: shows } },
          select: { showId: true },
          distinct: ["showId"],
        })
      : [],
  ]);
  return new Set([
    ...watchedFilms.map((f) => titleKey("movie", f.movieId)),
    ...begunShows.map((s) => titleKey("tv", s.showId)),
  ]);
}

/** The cache key a category's first page is stored under, for tests that seed it. */
export function categoryKey(slug: CategorySlug, ctx: Context) {
  const { path, params } = CATEGORIES[slug].request(ctx);
  return cacheKey(path, params);
}

// ---------------------------------------------------------------------------
// Things you may like

/** How many of the latest titles watched the recommendations are drawn from. */
export const FOR_YOU_SEEDS = 5;

/**
 * The last titles this person watched, newest first, one entry per title: a
 * night of six episodes is one show. Read from the play log, which knows the
 * order. A narrowed filter draws only on its own medium, so Shows is shows
 * recommended from shows.
 */
export async function recentTitles(userId: string, type: DiscoverType, count = FOR_YOU_SEEDS) {
  const plays = await db.play.findMany({
    where: { userId, ...(type === "all" ? {} : { mediaType: type }) },
    orderBy: { watchedAt: "desc" },
    select: { mediaType: true, tmdbId: true },
    // Enough to find five different titles behind a binge.
    take: 200,
  });
  const seen = new Set<string>();
  const out: { mediaType: MediaType; id: number }[] = [];
  for (const p of plays) {
    const mediaType: MediaType = p.mediaType === "tv" ? "tv" : "movie";
    const key = titleKey(mediaType, p.tmdbId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mediaType, id: p.tmdbId });
    if (out.length === count) break;
  }
  return out;
}

/**
 * "Things you may like": TMDB's recommendations for each of the last five
 * titles watched, through the cache with the trending lifetime, so the row
 * costs five requests an hour at most and rows the rest of the time. Taken a
 * place at a time from each list in turn, so one seed's twenty cannot fill the
 * row, with duplicates, the seeds themselves and anything seen dropped. Null
 * when every request failed with nothing cached: an outage, not an empty row.
 */
export async function fetchForYou(userId: string, type: DiscoverType): Promise<ListItem[] | null> {
  const seeds = await recentTitles(userId, type);
  if (seeds.length === 0) return [];
  const lists = await mapLimit(seeds, 4, (seed) =>
    tmdbGet<Paged>("trending", `/${seed.mediaType}/${seed.id}/recommendations`)
      .then((d) => d.results.map((r) => normalise(r, seed.mediaType)).filter((i): i is ListItem => i !== null))
      .catch(() => null),
  );
  if (lists.every((l) => l === null)) return null;

  const taken = new Set(seeds.map((s) => titleKey(s.mediaType, s.id)));
  const merged: ListItem[] = [];
  const longest = Math.max(0, ...lists.map((l) => l?.length ?? 0));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list?.[i];
      if (!item || (type !== "all" && item.mediaType !== type)) continue;
      const key = titleKey(item.mediaType, item.id);
      if (taken.has(key)) continue;
      taken.add(key);
      merged.push(item);
    }
  }
  const seen = await seenAmong(userId, merged);
  return merged.filter((i) => !seen.has(titleKey(i.mediaType, i.id)));
}

// ---------------------------------------------------------------------------
// The filter page

/** `total` is TMDB's count across the halves, before the leave-out toggles, which TMDB knows nothing of. */
export type FilteredPage = { items: ListItem[]; page: number; totalPages: number; total: number };

/**
 * One page of the filter page's answer: the smart list builder's query for
 * each medium the filters leave in, `GRID_PAGE` titles split evenly between
 * them from the TMDB pages they span, through the cache, interleaved, then
 * the two leave-out toggles. A page thinned by the toggles is shown thinned
 * rather than topped up from the next, so every page is a fixed window of
 * TMDB's list and Next never skips anything.
 */
export async function fetchFiltered(
  state: FilterState,
  page: number,
  ctx: { userId: string; region: string; today: string },
): Promise<FilteredPage | null> {
  const f = toSmartFilters(state);
  const halves = (["movie", "tv"] as const)
    .map((m) => ({ m, params: discoverParams(f, m, { region: ctx.region, today: ctx.today }) }))
    .filter((h): h is { m: MediaType; params: Record<string, string> } => h.params !== null);
  if (halves.length === 0) return { items: [], page, totalPages: 1, total: 0 };
  const per = GRID_PAGE / halves.length;
  // At most two halves, so this fan-out is bounded by the list above.
  const results = await Promise.all(halves.map((h) => readWindow(page, per, discoverPage(h.m, h.params)).catch(() => null)));
  if (results.every((r) => r === null)) return null;

  const merged = interleave(results.map((r) => r?.items ?? []));
  const viewer =
    f.hideWatched || f.hideSaved ? await viewerSets(ctx.userId) : { watched: new Set<string>(), saved: new Set<string>() };
  const kept = new Set(leaveOut(merged, f, viewer).map((i) => titleKey(i.mediaType, i.id)));
  return {
    items: merged.filter((i) => kept.has(titleKey(i.mediaType, i.id))),
    page,
    totalPages: Math.max(1, ...results.map((r) => gridPages(r?.total ?? 0, per))),
    total: results.reduce((sum, r) => sum + (r?.total ?? 0), 0),
  };
}
