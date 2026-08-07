"use server";

import { requireUser } from "./auth";
import { syncPlexWatchlist, type PlexSyncState } from "./plex-watchlist-sync";

/** The button in Settings. The work lives in `plex-watchlist-sync.ts`, because
 *  the now-playing poll runs the same sync on a timer. */
export async function importPlexWatchlist(): Promise<PlexSyncState> {
  const user = await requireUser();
  return syncPlexWatchlist(user.id);
}

export type { PlexSyncState };
