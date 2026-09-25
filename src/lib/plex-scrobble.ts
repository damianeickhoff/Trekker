import "server-only";
import { db } from "./db";
import { recordPlay, type PlayResult } from "./plays";
import { tmdbFromGuids, tmdbIdForKey, type PlexConnection } from "./plex-server";
import { episodeLength, filmLength } from "./runtime";
import { getMovieDetails, getTvDetails, tmdbConfigured } from "./tmdb";

/**
 * One thing Plex says was watched, turned into a play. Shared by the webhook,
 * the now-playing poll's 90% rule and the history sync, so the three agree on
 * who watched it and what it was. They can all report the same viewing; the
 * duplicate windows in `recordPlay` are what make that harmless, and a history
 * entry's own id is what lets a sync run for ever without doubling anything.
 */

export type PlexReport = {
  type: "movie" | "episode";
  /** The film, or the episode. */
  ratingKey: string | null;
  /** For an episode, its show. */
  grandparentRatingKey: string | null;
  /** The item's own guids when the report carries them (a film's include its TMDB id). */
  guids?: { id?: string }[] | null;
  /** The film's title, or the episode's. */
  title: string;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: Date;
  /** The source's id for this viewing: a history entry has one, a scrobble does not. */
  sourceRef?: string | null;
};

export type ReportOutcome = "logged" | "duplicate" | "unmatched" | "skipped";

/**
 * Whose viewing it is: the account signed in with that plex.tv id, then one
 * whose Plex name matches. The name is the fallback that covers a managed
 * Plex Home profile set up by hand before it ever signed in here.
 */
export async function viewerFor(account: { id?: string | number | null; title?: string | null } | null | undefined) {
  if (!account) return null;
  const id = account.id !== undefined && account.id !== null && account.id !== "" ? String(account.id) : null;
  if (id) {
    const byId = await db.user.findUnique({ where: { plexAccountId: id }, select: { id: true } });
    if (byId) return byId.id;
  }
  const name = account.title?.trim();
  if (!name) return null;
  const people = await db.user.findMany({ where: { plexUsername: { not: null } }, select: { id: true, plexUsername: true } });
  return people.find((p) => p.plexUsername!.toLowerCase() === name.toLowerCase())?.id ?? null;
}

/** The TMDB title a report is about, or null when the library never matched it to one. */
export async function tmdbIdForReport(report: PlexReport, conn: PlexConnection | null): Promise<number | null> {
  if (report.type === "movie") {
    const own = tmdbFromGuids(report.guids);
    if (own) return own;
    return report.ratingKey ? tmdbIdForKey(conn, report.ratingKey, "movie") : null;
  }
  // An episode's own guids name the episode, so the show is looked up by its key.
  return report.grandparentRatingKey ? tmdbIdForKey(conn, report.grandparentRatingKey, "tv") : null;
}

/**
 * Logs one report for one account. Specials are left out, as everywhere
 * else here. The title's details come through the TMDB cache; without TMDB
 * the play is still logged under Plex's own name for it.
 */
export async function logPlexReport(
  userId: string,
  report: PlexReport,
  conn: PlexConnection | null,
  tmdbId?: number | null,
): Promise<{ outcome: ReportOutcome; result?: PlayResult }> {
  if (report.type === "episode") {
    if (report.seasonNumber === null || report.episodeNumber === null) return { outcome: "skipped" };
    if (report.seasonNumber === 0) return { outcome: "skipped" };
  }
  const id = tmdbId !== undefined ? tmdbId : await tmdbIdForReport(report, conn);
  if (!id) {
    // Said out loud: silent, this looks exactly like a webhook that never arrived.
    console.warn(`Plex report dropped: "${report.showTitle ?? report.title}" is not matched to a TMDB id`);
    return { outcome: "unmatched" };
  }

  const online = tmdbConfigured();
  let result: PlayResult;
  if (report.type === "movie") {
    const d = online ? await getMovieDetails(id).catch(() => null) : null;
    result = await recordPlay(userId, {
      mediaType: "movie",
      tmdbId: id,
      title: d?.title ?? report.title,
      poster: d?.poster_path ?? null,
      runtime: filmLength(d) ?? 0,
      score: d ? Math.round(d.vote_average * 10) : null,
      watchedAt: report.watchedAt,
      source: "plex",
      sourceRef: report.sourceRef ?? null,
    });
  } else {
    const d = online ? await getTvDetails(id).catch(() => null) : null;
    result = await recordPlay(userId, {
      mediaType: "tv",
      tmdbId: id,
      title: d?.name ?? report.showTitle ?? report.title,
      poster: d?.poster_path ?? null,
      seasonNumber: report.seasonNumber,
      episodeNumber: report.episodeNumber,
      episodeName: report.title,
      runtime: episodeLength(d) ?? 42,
      watchedAt: report.watchedAt,
      source: "plex",
      sourceRef: report.sourceRef ?? null,
    });
  }
  return { outcome: result.created ? "logged" : "duplicate", result };
}
