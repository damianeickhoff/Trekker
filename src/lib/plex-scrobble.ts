import "server-only";
import { revalidatePath } from "next/cache";
import { getPlexConnection, getPlexTmdbId, type PlexHistoryEntry } from "./plex";
import { recordPlay } from "./plays";
import { getMovie, getTv, tmdbConfigured } from "./tmdb";

/**
 * Logs a single thing the moment Plex says it was watched.
 *
 * Shared by the webhook and by the now-playing poll, which is the fallback for
 * anyone without a Plex Pass. Both can fire for the same viewing, and they no
 * longer cancel out for free: a repeat used to be a no-op because the row was
 * unique per user and episode, but a play log has no such constraint. What stops
 * the duplicate now is the window inside `recordPlay`, which is a query rather
 * than a per-process cache — the webhook and the poll arrive on different
 * requests and, behind more than one worker, in different processes.
 *
 * This is also the path a genuine rewatch arrives on: watch something twice on
 * Plex and it now counts twice.
 */
export async function logPlexScrobble(
  userId: string,
  entry: PlexHistoryEntry,
): Promise<boolean> {
  if (!tmdbConfigured()) return false;

  /**
   * The server's own token, not the viewer's.
   *
   * All this asks is which TMDB title a library item is matched to, which is a
   * fact about the item and has nothing to do with who watched it — so there is
   * nothing to be gained by asking as the viewer, and something to lose. A
   * managed Plex Home profile holds a token from the Home switch, and every
   * failure below is silent: a token the server will not accept means no id,
   * which means this returns false and the viewing is dropped with no record of
   * why. Asking as the server takes that whole failure mode off the path.
   *
   * Watched *state* is per account and is still read as the viewer — see
   * `syncPlexHistory`. This is not that.
   */
  const connection = await getPlexConnection();
  if (!connection) return false;

  const key = entry.type === "episode" ? entry.grandparentRatingKey : entry.ratingKey;
  if (!key) return false;

  const tmdbId = await getPlexTmdbId(connection, key).catch(() => null);
  if (!tmdbId) {
    // Said out loud, because this is the end of the line for a viewing that
    // Plex has already reported. Silent, it looks exactly like a webhook that
    // never arrived — which is a very different thing to go looking for.
    console.warn(
      `Plex scrobble dropped: library item ${key} is not matched to a TMDB id`,
      { userId, title: entry.title },
    );
    return false;
  }

  if (entry.type === "movie") {
    const detail = await getMovie(tmdbId).catch(() => null);
    if (!detail) return false;

    await recordPlay(userId, {
      mediaType: "movie",
      tmdbId: detail.id,
      title: detail.title,
      poster: detail.poster_path,
      runtime: detail.runtime ?? 0,
      score: Math.round(detail.vote_average * 10),
      watchedAt: entry.watchedAt,
      source: "plex",
    });

    revalidatePath("/", "layout");
    return true;
  }

  if (entry.seasonNumber === null || entry.episodeNumber === null) return false;
  // Specials sit outside the numbered run and are not tracked here.
  if (entry.seasonNumber === 0) return false;

  const detail = await getTv(tmdbId).catch(() => null);
  if (!detail) return false;

  await recordPlay(userId, {
    mediaType: "tv",
    tmdbId: detail.id,
    title: detail.name,
    poster: detail.poster_path,
    seasonNumber: entry.seasonNumber,
    episodeNumber: entry.episodeNumber,
    episodeName: entry.title,
    runtime: detail.episode_run_time?.[0] ?? 42,
    watchedAt: entry.watchedAt,
    source: "plex",
  });

  revalidatePath("/", "layout");
  return true;
}
