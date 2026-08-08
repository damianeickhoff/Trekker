import "server-only";
import { db } from "./db";
import { findGenre } from "./genres";
import { expandProviders } from "./providers";
import { watchRegion } from "./region";
import {
  TV_STATUS_CODES,
  runtimeBounds,
  yearBounds,
  type SmartFilters,
} from "./smart-filters";
import { catalogue, tmdbConfigured, trending, type MediaType, type NormalisedItem } from "./tmdb";

/**
 * Answering a smart list.
 *
 * Almost all of this is one TMDB discover query per medium — discover is the
 * endpoint the whole feature is really a friendly face for. Two things it
 * cannot do are handled afterwards, in `exclude`: "trending", which is its own
 * ranked endpoint and takes no filters at all, and the two "hide what I have
 * already dealt with" toggles, which are facts about the viewer rather than
 * about the title.
 *
 * The same function serves the live editor and the nightly refresh. That is on
 * purpose: a preview that ran a different query from the one that gets saved
 * would be a preview of nothing.
 */

/** What TMDB returns per page of discover. */
const PAGE_SIZE = 20;

/**
 * The ceiling on how deep any single run will dig, whatever it is asked for.
 *
 * This is the backstop on the whole feature: "show me more" can be pressed all
 * afternoon, and every press still resolves to one bounded run. Without it a
 * caller asking for a large enough limit would walk TMDB's five hundred pages.
 */
const MAX_PAGES = 12;

/**
 * How many pages a run of this size should be willing to fetch.
 *
 * Two more than the arithmetic needs, because filtering throws rows away: a
 * list narrowed to "on Netflix, over 80%" keeps a handful per page, and stopping
 * at exactly `limit / 20` would hand back a quarter of what was asked for and
 * call it the end of the results.
 */
function pagesFor(limit: number) {
  return Math.min(MAX_PAGES, Math.ceil(limit / PAGE_SIZE) + 2);
}

/**
 * The vote floor that has to accompany any judgement about score.
 *
 * Without it, `vote_average.desc` and `vote_average.gte` both return a wall of
 * titles with four votes and a perfect ten. `catalogue.ts` carries the same
 * constant for the same reason.
 */
const VOTE_FLOOR: Record<MediaType, number> = { movie: 300, tv: 100 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whether this medium is part of the answer at all.
 *
 * Beyond the obvious kind switch, two filters can rule a whole medium out.
 * A production status only ever describes one of them — nothing is both "in
 * cinemas" and "a returning series" — so picking only TV statuses means the
 * question is not about films. And a genre TMDB has no television equivalent
 * for (horror, romance) cannot narrow a TV search, so honouring it by dropping
 * the whole TV half is the only reading that does not quietly return a pile of
 * shows nobody asked for.
 */
export function mediumApplies(filters: SmartFilters, mediaType: MediaType): boolean {
  if (filters.kind !== "both" && filters.kind !== mediaType) return false;

  if (filters.statuses.length > 0) {
    const relevant = filters.statuses.some((slug) =>
      mediaType === "tv" ? slug in TV_STATUS_CODES : slug === "released" || slug === "unreleased",
    );
    if (!relevant) return false;
  }

  // Discover carries `with_cast` for films and nothing equivalent for
  // television — and, worse, accepts the parameter on `/discover/tv` and
  // ignores it, so asking anyway returns the unfiltered catalogue rather than
  // an error. Dropping the medium is the only reading that does not quietly
  // answer a question nobody asked. Same call as the untranslatable genres
  // below, for the same reason.
  if (mediaType === "tv" && filters.cast.length > 0) return false;

  if (mediaType === "tv" && filters.genres.length > 0) {
    const untranslatable = filters.genres.some((slug) => findGenre(slug)?.tvId == null);
    if (untranslatable) return false;
  }

  return true;
}

/** Whether a cast filter is what is keeping television out, for the editor. */
export function castBlocksTv(filters: SmartFilters): boolean {
  return filters.cast.length > 0 && filters.kind !== "movie";
}

/** Genres in the filter that television has no equivalent for, for the editor. */
export function genresWithoutTv(filters: SmartFilters): string[] {
  return filters.genres.filter((slug) => findGenre(slug)?.tvId == null);
}

/**
 * The discover query for one medium, as a path `catalogue()` can take. Null
 * when this medium is not part of the answer.
 */
function discoverPath(filters: SmartFilters, mediaType: MediaType): string | null {
  if (!mediumApplies(filters, mediaType)) return null;

  const isMovie = mediaType === "movie";
  const params = new URLSearchParams();
  const dateField = isMovie ? "primary_release_date" : "first_air_date";
  const now = today();

  // -- Ordering, which is what the "state" chooser really picks ---------------
  switch (filters.source) {
    case "top-rated":
      params.set("sort_by", "vote_average.desc");
      params.set("vote_count.gte", String(VOTE_FLOOR[mediaType]));
      break;
    case "upcoming":
      params.set("sort_by", `${dateField}.asc`);
      params.set(`${dateField}.gte`, now);
      break;
    case "newest":
      params.set("sort_by", `${dateField}.desc`);
      // Without this, "newest" is a list of things announced for 2031.
      params.set(`${dateField}.lte`, now);
      break;
    case "popular":
      // What separates this from "Anything" below, which is otherwise the same
      // query: popularity is a claim about audience size, so it carries a vote
      // floor. Without one, `popularity.desc` still drags up titles nobody has
      // rated, and "popular" would mean nothing at all.
      params.set("sort_by", "popularity.desc");
      params.set("vote_count.gte", String(VOTE_FLOOR[mediaType]));
      break;
    // "trending" never reaches here — it has an endpoint of its own. "all" is
    // discover with no shelf of its own: popularity order because something has
    // to come first, and nothing else added, so the other filters are the only
    // thing narrowing it.
    default:
      params.set("sort_by", "popularity.desc");
      break;
  }

  // -- Genre: every one of them, not any of them -----------------------------
  if (filters.genres.length > 0) {
    const ids = filters.genres
      .map((slug) => (isMovie ? findGenre(slug)?.movieId : findGenre(slug)?.tvId))
      .filter((id): id is number => typeof id === "number");
    if (ids.length > 0) params.set("with_genres", ids.join(","));
  }

  // -- Who is in it. Films only; `mediumApplies` has already ruled TV out -----
  if (isMovie && filters.cast.length > 0) {
    // Comma is AND, as with genres: two names means a film they are both in.
    params.set("with_cast", filters.cast.map((person) => person.id).join(","));
  }

  // -- Where it streams ------------------------------------------------------
  if (filters.providers.length > 0) {
    const ids = [...expandProviders(filters.providers)];
    if (ids.length > 0) {
      // An OR, and only meaningful alongside a region — same as the discover bar.
      params.set("with_watch_providers", ids.join("|"));
      params.set("watch_region", watchRegion());
    }
  }

  // -- Age rating. TMDB carries these for films only -------------------------
  if (isMovie && filters.certifications.length > 0) {
    params.set("certification_country", watchRegion());
    params.set("certification", filters.certifications.join("|"));
  }

  // -- Production status -----------------------------------------------------
  if (filters.statuses.length > 0) {
    if (isMovie) {
      const released = filters.statuses.includes("released");
      const unreleased = filters.statuses.includes("unreleased");
      // Both, or neither, is no constraint at all.
      if (released && !unreleased) params.set(`${dateField}.lte`, now);
      if (unreleased && !released) params.set(`${dateField}.gte`, now);
    } else {
      const codes = filters.statuses
        .map((slug) => TV_STATUS_CODES[slug])
        .filter((code): code is number => code !== undefined);
      if (codes.length > 0) params.set("with_status", codes.join("|"));
    }
  }

  // -- Years -----------------------------------------------------------------
  const years = yearBounds(filters);
  if (years.from !== null) params.set(`${dateField}.gte`, `${years.from}-01-01`);
  if (years.to !== null) params.set(`${dateField}.lte`, `${years.to}-12-31`);

  // -- Score, as TMDB counts it (out of ten) ---------------------------------
  if (filters.scoreMin > 0) {
    params.set("vote_average.gte", String(filters.scoreMin / 10));
    // A minimum score without a vote floor is the four-votes-and-a-ten problem.
    if (!params.has("vote_count.gte")) {
      params.set("vote_count.gte", String(VOTE_FLOOR[mediaType]));
    }
  }
  if (filters.scoreMax < 100) params.set("vote_average.lte", String(filters.scoreMax / 10));

  // -- Length ----------------------------------------------------------------
  const runtimes = runtimeBounds(filters);
  if (runtimes.min !== null) params.set("with_runtime.gte", String(runtimes.min));
  if (runtimes.max !== null) params.set("with_runtime.lte", String(runtimes.max));

  return `/discover/${mediaType}?${params.toString()}`;
}

/** The path a smart list would run, for debugging and for the editor's caption. */
export function describeQuery(filters: SmartFilters): string[] {
  if (filters.source === "trending") return ["/trending"];
  return (["movie", "tv"] as const)
    .map((mediaType) => discoverPath(filters, mediaType))
    .filter((path): path is string => path !== null);
}

/** Sets of what the viewer has already seen and already put somewhere. */
export type ViewerState = { watched: Set<string>; saved: Set<string> };

/**
 * The two things `exclude` needs, as plain id sets.
 *
 * Deliberately not `getWatchStatuses` from `stats.ts`: that one works out how
 * far through each show the viewer is, which costs a TMDB call per show. "Have
 * I touched this at all" is two indexed queries, and it is all the toggle means.
 *
 * "Saved" covers the watchlist, the favourites and every manual list — the
 * toggle says "do not show me things I have already dealt with", and a title
 * sitting on a list the user made themselves is very much dealt with.
 */
export async function getViewerState(userId: string): Promise<ViewerState> {
  const [movies, shows, watchlist, favourites, listed] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId }, select: { movieId: true } }),
    db.watchedEpisode.findMany({
      where: { userId },
      select: { showId: true },
      distinct: ["showId"],
    }),
    db.watchlistItem.findMany({ where: { userId }, select: { mediaType: true, tmdbId: true } }),
    db.favourite.findMany({ where: { userId }, select: { mediaType: true, tmdbId: true } }),
    db.mediaListItem.findMany({
      where: { list: { userId, kind: "manual" } },
      select: { mediaType: true, tmdbId: true },
    }),
  ]);

  const watched = new Set<string>();
  for (const m of movies) watched.add(`movie-${m.movieId}`);
  for (const s of shows) watched.add(`tv-${s.showId}`);

  const saved = new Set<string>();
  for (const row of [...watchlist, ...favourites, ...listed]) {
    saved.add(`${row.mediaType}-${row.tmdbId}`);
  }

  return { watched, saved };
}

/**
 * Everything discover could not express: the trending endpoint's lack of
 * filters, and the viewer's own history.
 */
function exclude(
  items: NormalisedItem[],
  filters: SmartFilters,
  viewer: ViewerState,
  postFilter: boolean,
): NormalisedItem[] {
  const years = yearBounds(filters);
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.mediaType}-${item.id}`;
    // Films and shows are fetched separately and trending returns both, so the
    // same title can arrive twice.
    if (seen.has(key)) return false;
    seen.add(key);

    if (filters.hideWatched && viewer.watched.has(key)) return false;
    if (filters.hideSaved && viewer.saved.has(key)) return false;

    // Only the trending path needs the rest: everything else was narrowed by
    // TMDB itself, and re-checking a score TMDB rounded differently would throw
    // away titles that do match.
    if (!postFilter) return true;

    if (filters.kind !== "both" && item.mediaType !== filters.kind) return false;
    if (item.score < filters.scoreMin || item.score > filters.scoreMax) return false;

    if (years.from !== null || years.to !== null) {
      const year = item.year ? Number(item.year) : null;
      if (year === null) return false;
      if (years.from !== null && year < years.from) return false;
      if (years.to !== null && year > years.to) return false;
    }

    if (filters.genres.length > 0) {
      const ids = new Set(item.genreIds ?? []);
      const wanted = filters.genres.map((slug) =>
        item.mediaType === "movie" ? findGenre(slug)?.movieId : findGenre(slug)?.tvId,
      );
      if (!wanted.every((id) => typeof id === "number" && ids.has(id))) return false;
    }

    return true;
  });
}

/** Trending, deep enough to survive being filtered down afterwards. */
async function fetchTrending(filters: SmartFilters): Promise<NormalisedItem[]> {
  const scope = filters.kind === "both" ? "all" : filters.kind;
  const [week, day] = await Promise.all([
    trending(scope, "week").catch(() => []),
    // The daily list overlaps heavily with the weekly one, which is fine — it is
    // there to give a narrow filter more than twenty rows to work with.
    trending(scope, "day").catch(() => []),
  ]);
  return [...week, ...day];
}

/**
 * Runs a smart list and returns its titles, best first.
 *
 * Pages are fetched one round at a time and stopped as soon as there is enough,
 * so an unfiltered list costs a single request per medium and only a heavily
 * filtered one goes digging. `viewer` is optional: the nightly refresh has a
 * user, and so does the editor, but the code reads more honestly if "no viewer"
 * simply means the two toggles do nothing.
 */
export async function runSmartList(
  filters: SmartFilters,
  limit: number,
  viewer: ViewerState = { watched: new Set(), saved: new Set() },
): Promise<NormalisedItem[]> {
  if (!tmdbConfigured()) return [];

  if (filters.source === "trending") {
    const items = await fetchTrending(filters);
    return exclude(items, filters, viewer, true).slice(0, limit);
  }

  const paths = (["movie", "tv"] as const)
    .map((mediaType) => ({ mediaType, path: discoverPath(filters, mediaType) }))
    .filter((entry): entry is { mediaType: MediaType; path: string } => entry.path !== null);

  if (paths.length === 0) return [];

  const collected: NormalisedItem[] = [];
  const depth = pagesFor(limit);

  for (let page = 1; page <= depth; page++) {
    const rounds = await Promise.all(
      paths.map((entry) =>
        catalogue(entry.path, entry.mediaType, page).catch(() => null),
      ),
    );

    // Interleaved rather than concatenated, so a "both" list is not all the
    // films followed by all the shows — the same trick `fetchGenre` uses.
    const lists = rounds.map((round) => round?.items ?? []);
    const longest = Math.max(0, ...lists.map((list) => list.length));
    for (let i = 0; i < longest; i++) {
      for (const list of lists) if (list[i]) collected.push(list[i]);
    }

    const kept = exclude(collected, filters, viewer, false);
    if (kept.length >= limit) return kept.slice(0, limit);

    // Every medium ran out of pages: there is nothing more to find.
    if (rounds.every((round) => !round || round.page >= round.totalPages)) break;
  }

  return exclude(collected, filters, viewer, false).slice(0, limit);
}
