import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import { scheduleUnlockCheck } from "./achievements";
import { playsTag } from "./home-cache";
import { bellTag } from "./notifications";

/**
 * What every action that logs, removes or redates a viewing does next: expire
 * this person's play-derived rails and their bell (the level moved), and look
 * for a badge reached, behind the response. Only for server actions, where
 * `updateTag` may be called.
 */
export function viewingChanged(userId: string) {
  updateTag(playsTag(userId));
  updateTag(bellTag(userId));
  scheduleUnlockCheck(userId);
}

/**
 * The same for a viewing that arrived from outside the app (the Plex webhook,
 * the now-playing poll), from a route handler, where `updateTag` is not
 * allowed but expiring a tag is. Outside any request, as in a background
 * sync, Next has nowhere to record the expiry; the five-minute lifetime on
 * those entries is the backstop there, so the failure is swallowed.
 */
export function viewingChangedOutside(userId: string) {
  try {
    revalidateTag(playsTag(userId), { expire: 0 });
    revalidateTag(bellTag(userId), { expire: 0 });
  } catch {
    // Not inside a request; see above.
  }
  scheduleUnlockCheck(userId);
}
