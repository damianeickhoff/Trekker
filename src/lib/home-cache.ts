import "server-only";
import { unstable_cache } from "next/cache";
import { measureMonth, periodKey } from "./challenges";
import { todayKey } from "./dates";
import { getRecentlyWatched } from "./home";
import { getOnThisDay } from "./on-this-day";

/**
 * The parts of Home that only a viewing can change, held in the Next data
 * cache under one tag per person. The mark-watched and redate actions expire
 * that tag and nothing else, so a tick costs this person's Recently watched
 * and challenge progress, never anyone else's and never the layout.
 *
 * Up next and Landing soon are deliberately not here: the refresh job moves
 * them from outside any request, where Next cannot expire a tag, and they are
 * two indexed reads anyway. The lifetime below is the backstop for the other
 * writer outside a request, a Plex sync, so a play it logs shows within minutes
 * even though it cannot say so.
 */

const LIFETIME_S = 300;

export const playsTag = (userId: string) => `plays:${userId}`;

export function cachedRecentlyWatched(userId: string) {
  return unstable_cache(() => getRecentlyWatched(userId), ["home-recent", userId], {
    tags: [playsTag(userId)],
    revalidate: LIFETIME_S,
  })();
}

/**
 * Keyed by the day as well as the month: progress within a month only moves
 * with a play, but the entry should not outlive the month it measured.
 */
export function cachedChallengeProgress(userId: string, now: Date) {
  return unstable_cache(() => measureMonth(userId, now), ["home-challenges", userId, periodKey(now), todayKey(now)], {
    tags: [playsTag(userId)],
    revalidate: LIFETIME_S,
  })();
}

/**
 * Keyed by the day: the answer changes at midnight whatever is played, and a
 * viewing today cannot change it at all, but the tag keeps a redate honest.
 */
export function cachedOnThisDay(userId: string) {
  return unstable_cache(() => getOnThisDay(userId), ["home-on-this-day", userId, todayKey()], {
    tags: [playsTag(userId)],
    revalidate: LIFETIME_S,
  })();
}
