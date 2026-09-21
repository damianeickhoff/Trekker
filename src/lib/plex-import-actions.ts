"use server";

import { refresh } from "next/cache";
import { requireUser } from "./auth";
import { syncPlexWatchlist, type PlexSyncState } from "./plex-watchlist-sync";

/** The button in Settings. The work lives in `plex-watchlist-sync.ts`, because
 *  the now-playing poll runs the same sync on a timer. */
export async function importPlexWatchlist(): Promise<PlexSyncState> {
  const user = await requireUser();
  const result = await syncPlexWatchlist(user.id);

  // The sync no longer revalidates for itself: on the timer that only emptied
  // the TMDB cache. Here a page is waiting on the answer, and `refresh` gives it
  // one without discarding anything cached.
  refresh();

  return result;
}

export type { PlexSyncState };
