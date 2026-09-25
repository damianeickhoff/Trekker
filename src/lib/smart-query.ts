import { findGenre } from "./genres";
import { expandProviders } from "./providers";
import { runtimeBounds, statusApplies, TV_STATUS_CODES, yearBounds, type SmartFilters } from "./smart-filters";

/**
 * A smart list as TMDB questions. Pure, so the rules can be tested and the
 * editor can say what the query will do before it runs.
 *
 * Nearly everything is one `/discover` query per medium. Three things are not:
 * Trending is TMDB's own ranking and takes no parameters, so genre, score and
 * years are applied to what comes back and length and services cannot be;
 * certificates exist for films only; and a genre television has no equivalent
 * for drops the shows half rather than returning shows nobody asked for.
 */

export type MediaType = "movie" | "tv";

/**
 * The vote floor behind the shelves that claim an audience (Popular) or a
 * ranking by score (Top rated): without it both surface titles with four votes
 * and a perfect ten. The score slider does not bring it (see `discoverParams`).
 */
export const VOTE_FLOOR: Record<MediaType, number> = { movie: 300, tv: 100 };

/** Genres in the filters that television has no equivalent for. The editor's note. */
export function genresWithoutTv(f: SmartFilters): string[] {
  return f.genres.filter((slug) => findGenre(slug)?.tvId == null);
}

/**
 * Whether this medium is part of the answer at all. Beyond the kind switch:
 * statuses that only describe the other medium, a person (TMDB has no cast
 * filter for television, and accepts the parameter and ignores it, which would
 * return the whole catalogue), and a genre with no television equivalent.
 */
export function mediumApplies(f: SmartFilters, mediaType: MediaType): boolean {
  if (f.kind !== "both" && f.kind !== mediaType) return false;
  if (f.statuses.length) {
    const relevant = f.statuses.some((s) => statusApplies(s, mediaType));
    if (!relevant) return false;
  }
  if (mediaType === "tv" && f.cast.length) return false;
  if (mediaType === "tv" && genresWithoutTv(f).length) return false;
  return true;
}

/** Why the shows half is missing, in the editor's words, or null when it is not. */
export function tvNote(f: SmartFilters): string | null {
  if (f.kind === "movie") return null;
  const missing = genresWithoutTv(f);
  if (missing.length) {
    const names = missing.map((slug) => findGenre(slug)?.label ?? slug);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} have` : `${names[0]} has`;
    return `${list} no television equivalent on TMDB, so the shows half of this query is left out. Films only until you drop ${missing.length > 1 ? "those genres" : "that genre"}.`;
  }
  if (f.cast.length && f.source !== "trending") {
    return "TMDB cannot look for people in shows, so the shows half of this query is left out while someone is chosen.";
  }
  return null;
}

/** What Trending cannot honour, for the editor. */
export function trendingNote(f: SmartFilters): string | null {
  if (f.source !== "trending") return null;
  const lost = [
    f.providers.length && "services",
    (runtimeBounds(f).min !== null || runtimeBounds(f).max !== null) && "length",
    f.statuses.length && "status",
    f.certifications.length && "certificate",
    f.cast.length && "people",
  ].filter((s): s is string => Boolean(s));
  return lost.length
    ? `Trending is TMDB's own ranking and takes no filters: genre, score and years are applied to what it returns, but ${lost.join(", ")} cannot be.`
    : "Trending is TMDB's own ranking: genre, score and years are applied to what it returns.";
}

/**
 * The discover parameters for one medium, or null when the medium is not part
 * of the answer. Never called for Trending, which has an endpoint of its own.
 */
export function discoverParams(
  f: SmartFilters,
  mediaType: MediaType,
  context: { region: string; today: string },
): Record<string, string> | null {
  if (!mediumApplies(f, mediaType)) return null;
  const movie = mediaType === "movie";
  const date = movie ? "primary_release_date" : "first_air_date";
  const p: Record<string, string> = {};

  // The shelf, a status and the years can each bound the date. Every one of
  // them narrows, so where two meet the tighter wins: letting the years simply
  // overwrite the others is how "released, 1990 to 2026" came to include next
  // month's films, and "upcoming, from 1990" films from 1990.
  const after = (day: string) => {
    const key = `${date}.gte`;
    if (!p[key] || day > p[key]) p[key] = day;
  };
  const before = (day: string) => {
    const key = `${date}.lte`;
    if (!p[key] || day < p[key]) p[key] = day;
  };

  // The shelf, which is really an ordering.
  switch (f.source) {
    case "top-rated":
      p.sort_by = "vote_average.desc";
      p["vote_count.gte"] = String(VOTE_FLOOR[mediaType]);
      break;
    case "upcoming":
      p.sort_by = `${date}.asc`;
      after(context.today);
      break;
    case "newest":
      p.sort_by = `${date}.desc`;
      // Without this, "newest" is a list of things announced for 2031.
      before(context.today);
      break;
    case "popular":
      // All that separates this from Anything: an audience behind it.
      p.sort_by = "popularity.desc";
      p["vote_count.gte"] = String(VOTE_FLOOR[mediaType]);
      break;
    default:
      // Anything: popularity order because something has to come first, and
      // nothing else, so the other filters are all that narrow it.
      p.sort_by = "popularity.desc";
  }

  // Every genre, not any: comma is AND to TMDB.
  if (f.genres.length) {
    const ids = f.genres
      .map((slug) => (movie ? findGenre(slug)?.movieId : findGenre(slug)?.tvId))
      .filter((id): id is number => typeof id === "number");
    if (ids.length) p.with_genres = [...new Set(ids)].join(",");
  }

  if (movie && f.cast.length) p.with_cast = f.cast.map((c) => c.id).join(",");

  // Any one service will do (pipe is OR), and only in a region.
  if (f.providers.length) {
    p.with_watch_providers = [...expandProviders(f.providers)].join("|");
    p.watch_region = context.region;
  }

  if (movie && f.certifications.length) {
    p.certification_country = context.region;
    p.certification = f.certifications.join("|");
  }

  // Only this medium's own statuses: in a "both" list the films half never
  // sees "ended" and the shows half never sees "released".
  const statuses = f.statuses.filter((s) => statusApplies(s, mediaType));
  if (statuses.length) {
    if (movie) {
      const released = statuses.includes("released");
      const unreleased = statuses.includes("unreleased");
      // Both, or neither, is no constraint.
      if (released && !unreleased) before(context.today);
      if (unreleased && !released) after(context.today);
    } else {
      const codes = statuses.map((s) => TV_STATUS_CODES[s]).filter((c): c is number => c !== undefined);
      if (codes.length) p.with_status = codes.join("|");
    }
  }

  const years = yearBounds(f);
  if (years.from !== null) after(`${years.from}-01-01`);
  if (years.to !== null) before(`${years.to}-12-31`);

  // The slider is the percentage printed on posters: TMDB's 0 to 10 average
  // times ten, rounded. The bounds are widened by that rounding, so a poster
  // reading 70% is in "70% or better" and one reading 61% is not in "60% or
  // lower". No vote floor comes with a score: one added only when a minimum
  // was set meant moving the slider from 0 to 10 took away every film with
  // fewer than 300 votes, whatever it was rated. The floor belongs to the
  // shelf (Popular and Top rated carry one); Anything is the whole catalogue.
  if (f.scoreMin > 0) p["vote_average.gte"] = decimal((f.scoreMin - 0.5) / 10);
  if (f.scoreMax < 100) p["vote_average.lte"] = decimal((f.scoreMax + 0.5) / 10 - 0.0001);

  const length = runtimeBounds(f);
  if (length.min !== null) p["with_runtime.gte"] = String(length.min);
  if (length.max !== null) p["with_runtime.lte"] = String(length.max);

  return p;
}

/** A number as TMDB is sent it: four places at most, and no float noise. */
function decimal(n: number) {
  return String(Number(n.toFixed(4)));
}

/** A title as the query steps see it: enough to post-filter and to store. */
export type Found = {
  id: number;
  mediaType: MediaType;
  title: string;
  poster: string | null;
  score: number;
  year: string | null;
  genreIds: number[];
};

/**
 * What Trending returns, narrowed by what can be read off its own rows:
 * the medium, genre, score and years. Discover results never come through
 * here: TMDB narrowed them itself, and re-checking a score it rounded
 * differently would throw away titles that do match.
 */
export function filterTrending(items: Found[], f: SmartFilters): Found[] {
  const years = yearBounds(f);
  return items.filter((item) => {
    if (f.kind !== "both" && item.mediaType !== f.kind) return false;
    if (item.score < f.scoreMin || item.score > f.scoreMax) return false;
    if (years.from !== null || years.to !== null) {
      const year = item.year ? Number(item.year) : null;
      if (year === null) return false;
      if (years.from !== null && year < years.from) return false;
      if (years.to !== null && year > years.to) return false;
    }
    if (f.genres.length) {
      const ids = new Set(item.genreIds);
      const wanted = f.genres.map((slug) => (item.mediaType === "movie" ? findGenre(slug)?.movieId : findGenre(slug)?.tvId));
      if (!wanted.every((id) => typeof id === "number" && ids.has(id))) return false;
    }
    return true;
  });
}

/** Seen, and already filed somewhere, as `movie-603` keys. */
export type ViewerSets = { watched: ReadonlySet<string>; saved: ReadonlySet<string> };

/** Duplicates out (both halves and both trending windows can return a title twice), then the two leave-out toggles. */
export function leaveOut(items: Found[], f: SmartFilters, viewer: ViewerSets): Found[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (f.hideWatched && viewer.watched.has(key)) return false;
    if (f.hideSaved && viewer.saved.has(key)) return false;
    return true;
  });
}

/**
 * Above this the editor's preview says "500+" rather than a number: past a few
 * hundred the size of a question tells nobody anything, and a run never reads
 * that deep (eight pages a medium at most), so a bigger figure would be TMDB's
 * say-so rather than anything the preview has seen.
 */
export const MATCH_CAP = 500;

/**
 * How many titles a question matches, as the editor's preview reports it.
 * `reported` is TMDB's `total_results` for each half that answered (one for a
 * film or show list, two for Both). TMDB knows nothing of the leave-out
 * toggles, so what they have thrown away of the pages fetched so far comes off
 * its figure; and once every half has been read to its last page, what was
 * kept is the exact answer and TMDB's estimate is not needed. Never fewer than
 * were kept, whatever TMDB says.
 */
export function matchTotal({
  reported,
  fetched,
  kept,
  exhausted,
}: {
  reported: number[];
  /** Titles fetched so far, duplicates and left-out ones included. */
  fetched: number;
  kept: number;
  exhausted: boolean;
}): number {
  if (exhausted) return kept;
  const sum = reported.reduce((a, b) => a + b, 0);
  return Math.max(kept, sum - (fetched - kept));
}

/** The preview's count line: "20 of 348 match", "7 of 7 match", "20 of 500+ match". */
export function matchLine(shown: number, total: number): string {
  return `${shown} of ${total > MATCH_CAP ? `${MATCH_CAP}+` : total} match`;
}
