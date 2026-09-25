import type { MovieDetails, TvDetails } from "./tmdb";

/*
 * The line of facts under a title on its page, the old app's facts in the old
 * app's order: year, genres, seasons (or running time for a film), votes,
 * status. Everything comes from the cached details the page has already read,
 * so the line costs no request of its own.
 */

/**
 * TMDB's status in the app's words: sentence case and British spelling.
 * "Post Production" is still being made, as far as anyone waiting is
 * concerned, so it reads as in production. Anything TMDB adds later is shown
 * in sentence case rather than dropped.
 */
export function statusWord(status: string | null | undefined): string | null {
  switch (status?.trim()) {
    case undefined:
    case "":
      return null;
    case "Returning Series":
      return "Returning series";
    case "Ended":
      return "Ended";
    case "Canceled":
    case "Cancelled":
      return "Cancelled";
    case "Released":
      return "Released";
    case "In Production":
    case "Post Production":
      return "In production";
    case "Rumored":
      return "Rumoured";
    default: {
      const s = status!.trim().toLowerCase();
      return s[0].toUpperCase() + s.slice(1);
    }
  }
}

const count = (n: number, one: string) => `${n.toLocaleString("en-GB")} ${one}${n === 1 ? "" : "s"}`;

function genreList(genres: { name: string }[] | undefined) {
  return (genres ?? [])
    .slice(0, 3)
    .map((g) => g.name)
    .join(", ");
}

/** A series: "2008 · Drama, Crime · 5 seasons · 15,321 votes · Ended". */
export function seriesMeta(details: Pick<TvDetails, "first_air_date" | "genres" | "number_of_seasons" | "vote_count" | "status">) {
  return [
    details.first_air_date?.slice(0, 4),
    genreList(details.genres),
    details.number_of_seasons ? count(details.number_of_seasons, "season") : null,
    count(details.vote_count ?? 0, "vote"),
    statusWord(details.status),
  ].filter(Boolean) as string[];
}

/** A film: "1999 · Drama · 139 min · 31,002 votes · Released". */
export function filmMeta(details: Pick<MovieDetails, "release_date" | "genres" | "runtime" | "vote_count" | "status">) {
  return [
    details.release_date?.slice(0, 4),
    genreList(details.genres),
    details.runtime ? `${details.runtime} min` : null,
    count(details.vote_count ?? 0, "vote"),
    statusWord(details.status),
  ].filter(Boolean) as string[];
}

/** TMDB sends an empty string rather than nothing when a title has no tagline. */
export function taglineOf(details: { tagline?: string | null }) {
  return details.tagline?.trim() || null;
}
