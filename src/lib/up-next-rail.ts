import "server-only";
import { getSeason } from "./tmdb";

/**
 * One season's episodes, in the shape the "watch next" row wants.
 *
 * Only one, and only the first one: the row starts at the season the viewer is
 * up to and fetches the rest as they scroll towards them. Loading everything up
 * front meant a request per season before the page could render — thirty-six of
 * them on a long-running show — to fill a row nobody scrolls to the end of.
 */

export type RailEpisode = {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  /** Carried so the row can open the same episode dialog the list below does. */
  overview: string;
  still: string | null;
  airDate: string | null;
  runtime: number | null;
  /** TMDB's audience score, 0–100, or 0 where nobody has voted. */
  score: number;
};

export async function getSeasonEpisodes(
  showId: number,
  seasonNumber: number,
): Promise<RailEpisode[]> {
  const season = await getSeason(showId, seasonNumber).catch(() => null);

  return (season?.episodes ?? []).map((episode) => ({
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    name: episode.name,
    overview: episode.overview,
    still: episode.still_path,
    airDate: episode.air_date,
    runtime: episode.runtime,
    score: Math.round((episode.vote_average ?? 0) * 10),
  }));
}
