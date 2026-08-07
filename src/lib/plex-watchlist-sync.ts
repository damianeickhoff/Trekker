import "server-only";

import { revalidatePath } from "next/cache";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { addToPlexWatchlist, getPlexWatchlist, PlexWatchlistError } from "./plex-watchlist";
import { getMovie, getTv, tmdbConfigured } from "./tmdb";

export type PlexSyncState = {
  error?: string;
  summary?: {
    added: number;
    already: number;
    skipped: number;
    /** Sent the other way, from here to plex.tv. */
    pushed: number;
    pushFailed: number;
    /** Distinct reasons the failures gave, so a failure can be acted on. */
    pushErrors: string[];
  };
};

const FANOUT = 6;
const MAX_ITEMS = 300;

/**
 * Pulls the plex.tv watchlist into Trekker's.
 *
 * One direction only. Adding to Plex's watchlist from here needs their metadata
 * rating key rather than a TMDB id, which is a second lookup per title against
 * a different service — worth doing, but not the same job as this.
 *
 * Nothing is removed: a title dropped from Plex's list is not evidence that the
 * viewer no longer wants it here.
 */
export async function syncPlexWatchlist(userId: string): Promise<PlexSyncState> {
  const user = { id: userId };

  if (!tmdbConfigured()) return { error: "TMDB_API_KEY is not set on the server" };

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { plexAuthToken: true },
  });

  if (!account?.plexAuthToken) {
    return { error: "Sign in with Plex first — that is what grants access to your watchlist." };
  }

  let entries;
  try {
    entries = await getPlexWatchlist(account.plexAuthToken);
  } catch (error) {
    if (error instanceof PlexWatchlistError) return { error: error.message };
    return { error: "Could not read your Plex watchlist" };
  }

  const existing = new Set(
    (
      await db.watchlistItem.findMany({
        where: { userId: user.id },
        select: { mediaType: true, tmdbId: true },
      })
    ).map((item) => `${item.mediaType}-${item.tmdbId}`),
  );

  const wanted = entries.slice(0, MAX_ITEMS);
  const fresh = wanted.filter((e) => !existing.has(`${e.mediaType}-${e.tmdbId}`));

  // Titles are re-resolved against TMDB rather than trusting Plex's copy: the
  // poster and score are what the rest of the app renders from.
  const resolved = await mapLimit(fresh, FANOUT, async (entry) => {
    const detail =
      entry.mediaType === "tv"
        ? await getTv(entry.tmdbId).catch(() => null)
        : await getMovie(entry.tmdbId).catch(() => null);

    if (!detail) return null;

    return {
      userId: user.id,
      mediaType: entry.mediaType,
      tmdbId: entry.tmdbId,
      title: "title" in detail ? detail.title : detail.name,
      poster: detail.poster_path,
      score: Math.round(detail.vote_average * 10),
    };
  });

  const rows = resolved.filter((row) => row !== null);
  if (rows.length > 0) await db.watchlistItem.createMany({ data: rows });

  // ---- The other direction --------------------------------------------------
  // Anything on Trekker's list that Plex has never heard of gets pushed across,
  // so the two lists converge rather than one shadowing the other.
  const onPlex = new Set(entries.map((e) => `${e.mediaType}-${e.tmdbId}`));

  const mine = await db.watchlistItem.findMany({
    where: { userId: user.id },
    select: { mediaType: true, tmdbId: true, title: true },
    take: MAX_ITEMS,
  });

  const missing = mine.filter((item) => !onPlex.has(`${item.mediaType}-${item.tmdbId}`));

  const pushed = await mapLimit(missing, 3, async (item) => {
    const result = await addToPlexWatchlist(account.plexAuthToken!, {
      tmdbId: item.tmdbId,
      mediaType: item.mediaType === "tv" ? "tv" : "movie",
      title: item.title,
      year: null,
    }).catch((error: unknown) => ({
      ok: false,
      reason: error instanceof Error ? error.message : "unknown error",
    }));

    return { ok: result.ok, reason: "reason" in result ? result.reason : undefined };
  });

  // Why, not just how many. "10 could not be sent" is not something anyone can
  // act on; the reason Plex gave is.
  const pushErrors = [
    ...new Set(pushed.filter((p) => !p.ok).map((p) => p.reason ?? "unknown error")),
  ].slice(0, 3);

  revalidatePath("/", "layout");
  return {
    summary: {
      added: rows.length,
      already: wanted.length - fresh.length,
      skipped: entries.length - wanted.length + (fresh.length - rows.length),
      pushed: pushed.filter((p) => p.ok).length,
      pushFailed: pushed.filter((p) => !p.ok).length,
      pushErrors,
    },
  };
}
