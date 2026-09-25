/**
 * The Overseerr mark on artwork: the play mark for on Plex, an amber clock for
 * requested, nothing otherwise. Shared by the server reads that work it out and
 * the components that draw it.
 */
export type Mark = "plex" | "requested" | null;

export const titleKey = (mediaType: string, tmdbId: number) => `${mediaType}-${tmdbId}`;

/** "S01 · E05": two digits, as the mockups write every episode code. */
export function episodeCode(season: number | null, episode: number | null): string {
  const pad = (n: number | null) => String(n ?? 0).padStart(2, "0");
  return `S${pad(season)} · E${pad(episode)}`;
}

/**
 * The accessible name of every control that marks something watched, the same
 * at both widths and on every page: "Mark S03 E08 watched" for an episode,
 * "Mark watched" for a film. The when-menu names the show; this stays short,
 * the row or hero it sits in already saying which show it is.
 */
export function markWatchedLabel(season?: number | null, episode?: number | null): string {
  if (season == null || episode == null) return "Mark watched";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Mark S${pad(season)} E${pad(episode)} watched`;
}

export function titleHref(mediaType: "movie" | "tv", tmdbId: number) {
  return `/title/${mediaType}/${tmdbId}`;
}

/**
 * The item in Plex's web app on the instance's server. The machine id is on
 * the admin account and the rating key on `Availability`; without both there
 * is nowhere to send anyone.
 */
export function plexWebUrl(machineId: string | null | undefined, ratingKey: string | null | undefined) {
  if (!machineId || !ratingKey) return null;
  return `https://app.plex.tv/desktop/#!/server/${machineId}/details?key=${encodeURIComponent(
    `/library/metadata/${ratingKey}`,
  )}`;
}
