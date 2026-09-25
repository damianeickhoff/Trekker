import type { MovieDetails, TvDetails } from "./tmdb";

/**
 * How long a title takes, from its details. Pure, so the list writes and the
 * daily job agree on one answer.
 */

/**
 * One episode's length: `episode_run_time` is being retired by TMDB, so an
 * actual episode's length is the fallback that keeps a show from having none.
 */
export function episodeLength(d: Pick<TvDetails, "episode_run_time" | "last_episode_to_air" | "next_episode_to_air"> | null) {
  return (
    [d?.episode_run_time?.[0], d?.last_episode_to_air?.runtime, d?.next_episode_to_air?.runtime].find(
      (m): m is number => typeof m === "number" && m > 0,
    ) ?? null
  );
}

/** A film's length. Zero is TMDB's "unknown", not a very short film. */
export function filmLength(d: Pick<MovieDetails, "runtime"> | null) {
  return d?.runtime && d.runtime > 0 ? d.runtime : null;
}

/**
 * Minutes to watch the whole thing, which is what a list's hours add up and
 * its "Shortest" order compares: a film's length, or a show's episode length
 * times its episodes, so a miniseries is not ranked beside a feature.
 */
export function wholeRuntime(mediaType: "movie" | "tv", d: MovieDetails | TvDetails | null): number | null {
  if (!d) return null;
  if (mediaType === "movie") return filmLength(d as MovieDetails);
  const tv = d as TvDetails;
  const each = episodeLength(tv);
  return each && tv.number_of_episodes > 0 ? each * tv.number_of_episodes : null;
}
