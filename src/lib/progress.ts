import type { TvDetails } from "./tmdb";

/**
 * What the progress panel on a show says. A bar only says something while
 * there is ground left to cover; once someone is caught up it is permanently
 * full and tells them nothing, so it is replaced by the answer to the question
 * they actually have: was that the end, or is there more coming?
 *
 * Pure, so the choice can be tested without a page.
 */

export type Verdict = "bar" | "finished" | "more";

/**
 * Whether a whole further season is pending, as opposed to the current one
 * still airing week to week, which is ordinary progress rather than a
 * cliffhanger. With no date announced, a returning series still has one coming.
 */
export function seasonToCome(
  details: Pick<TvDetails, "status" | "last_episode_to_air" | "next_episode_to_air" | "seasons">,
): boolean {
  const ended = details.status === "Ended" || details.status === "Canceled" || details.status === "Cancelled";
  if (ended) return false;
  const last = details.last_episode_to_air;
  const current = details.seasons.find((s) => s.season_number === last?.season_number);
  const stillAiring = Boolean(last && current && last.episode_number < current.episode_count);
  if (stillAiring) return false;
  const next = details.next_episode_to_air;
  return next ? next.season_number > (last?.season_number ?? 0) : details.status === "Returning Series";
}

export function progressVerdict(input: {
  airedCount: number;
  watchedCount: number;
  /** Ended or cancelled: nothing further is coming. */
  ended: boolean;
  seasonToCome: boolean;
}): Verdict {
  const caughtUp = input.airedCount > 0 && input.watchedCount >= input.airedCount;
  if (caughtUp && input.ended) return "finished";
  if (caughtUp && input.seasonToCome) return "more";
  return "bar";
}

/** The crowd's view of a finished show, read back with some sympathy. */
export function verdictOnScore(score: number | null): string {
  if (!score) return "Nobody has rated it enough to say much. You got there first.";
  if (score >= 80) return `The crowd settled on ${score}%, so you picked a genuinely great one.`;
  if (score >= 70) return `At ${score}% the internet agrees it was worth the hours.`;
  if (score >= 50) return `The crowd only managed ${score}%, which means you saw something they missed.`;
  return `${score}% from everyone else. You finished it anyway, which is commitment.`;
}

/** "4h 04m", or "52m" under the hour. */
export function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/**
 * The season a show's page opens on when the address does not name one: the
 * season holding the next episode to watch, meaning the first aired episode
 * not yet seen, in order, which is how the old app's up-next row chose where
 * to sit. Caught up, the latest season that has aired, where the next episode
 * will land; never started, the first season.
 *
 * `stored` is the kept episode list. A show the job has not kept yet has none,
 * and then `fallback` (the `TitleState` answer the hero uses meanwhile) and
 * TMDB's last aired episode stand in for it.
 */
export function openingSeason(input: {
  /** The numbered seasons with episodes, ascending. */
  seasons: number[];
  stored: { seasonNumber: number; episodeNumber: number; airDate: string | null }[];
  /** "season:episode" keys of everything seen. */
  seen: ReadonlySet<string>;
  today: string;
  fallback: { season: number; airDate: string | null } | null;
  lastAiredSeason: number | null;
}): number {
  const { seasons, seen, today } = input;
  const first = seasons[0] ?? 1;
  const known = (n: number | null | undefined): n is number => n != null && seasons.includes(n);
  const seenSeasons = [...seen].map((k) => Number(k.split(":")[0])).filter(known);
  if (seenSeasons.length === 0) return first;

  const aired = input.stored
    .filter((e) => known(e.seasonNumber) && e.airDate !== null && e.airDate <= today)
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
  const next = aired.find((e) => !seen.has(`${e.seasonNumber}:${e.episodeNumber}`));
  if (next) return next.seasonNumber;

  const fallback = input.fallback;
  if (input.stored.length === 0 && fallback && known(fallback.season) && fallback.airDate && fallback.airDate <= today) {
    return fallback.season;
  }
  const latest = aired.at(-1)?.seasonNumber ?? (known(input.lastAiredSeason) ? input.lastAiredSeason : null);
  return latest ?? Math.max(...seenSeasons);
}
