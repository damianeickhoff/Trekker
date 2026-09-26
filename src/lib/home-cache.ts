import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { measureMonth, periodKey } from "./challenges";
import { todayKey } from "./dates";
import { db } from "./db";
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
 * two indexed reads anyway.
 *
 * The other writer outside a request, a Plex sync, cannot expire a tag either,
 * and the lifetime below is no help to it: an expired entry is still served
 * once while it refreshes, so the first Home after a sync would show the rail
 * as it was hours ago. Every key therefore carries the person's play count,
 * which `recordPlay` keeps on `User` whoever calls it: a play logged anywhere
 * is a new key, and the next render reads it. A redate leaves the count alone,
 * which is what the tag is for.
 */

const LIFETIME_S = 300;

export const playsTag = (userId: string) => `plays:${userId}`;

/** One primary-key read per request, shared by the three rails. */
const playsVersion = cache(async (userId: string) => {
  const row = await db.user.findUnique({ where: { id: userId }, select: { playCount: true } });
  return String(row?.playCount ?? 0);
});

export async function cachedRecentlyWatched(userId: string) {
  return unstable_cache(() => getRecentlyWatched(userId), ["home-recent", userId, await playsVersion(userId)], {
    tags: [playsTag(userId)],
    revalidate: LIFETIME_S,
  })();
}

/**
 * Keyed by the day as well as the month: progress within a month only moves
 * with a play, but the entry should not outlive the month it measured.
 */
export async function cachedChallengeProgress(userId: string, now: Date) {
  const key = ["home-challenges", userId, periodKey(now), todayKey(now), await playsVersion(userId)];
  return unstable_cache(() => measureMonth(userId, now), key, {
    tags: [playsTag(userId)],
    revalidate: LIFETIME_S,
  })();
}

/**
 * Keyed by the day: the answer changes at midnight whatever is played, and a
 * viewing today cannot change it at all, but the tag keeps a redate honest.
 */
export async function cachedOnThisDay(userId: string) {
  return unstable_cache(() => getOnThisDay(userId), ["home-on-this-day", userId, todayKey(), await playsVersion(userId)], {
    tags: [playsTag(userId)],
    revalidate: LIFETIME_S,
  })();
}
