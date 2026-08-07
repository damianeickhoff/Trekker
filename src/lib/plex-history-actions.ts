"use server";

import { syncUnlocks } from "./achievements";
import { absorbImport } from "./achievements/xp";
import { requireUser } from "./auth";
import { syncPlexHistory, type PlexHistoryState } from "./plex-history";

/** The button in Settings. The work itself lives in `plex-history.ts`, because
 *  the now-playing poll runs the same sync on a timer. */
export async function importPlexHistory(): Promise<PlexHistoryState> {
  const user = await requireUser();
  const result = await syncPlexHistory(user.id);

  // Pressing the button pulls in a back catalogue, so anything it satisfies
  // belongs to the history rather than to the level. The timer that runs the
  // same sync deliberately does not do this: an episode scrobbled as you watch
  // it is Trekker doing its job, and should count.
  await absorbImport(user.id, await syncUnlocks(user.id, { carried: true }));

  return result;
}

export type { PlexHistoryState };
