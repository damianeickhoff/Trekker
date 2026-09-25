import "server-only";
import { db } from "./db";
import { friendsOf, type Person } from "./friends";

/**
 * Handing a title to a friend: what feeds "Anna recommends Digger" in the
 * bell. Friends only, by the same accepted-friendship read every other social
 * view goes through; without it this would put an arbitrary poster in a
 * stranger's notifications.
 */

export type RecommendTarget = Person & { sent: boolean };

/** Everyone this title can go to, ticked where it already has. */
export async function recommendTargets(userId: string, mediaType: "movie" | "tv", tmdbId: number): Promise<RecommendTarget[]> {
  const friends = await friendsOf(userId);
  if (friends.length === 0) return [];
  const sent = await db.recommendation.findMany({
    where: { fromUserId: userId, mediaType, tmdbId, toUserId: { in: friends.map((f) => f.id) } },
    select: { toUserId: true },
  });
  const to = new Set(sent.map((r) => r.toUserId));
  return friends.map((f) => ({ ...f, sent: to.has(f.id) }));
}

export type RecommendOutcome = { ok: true } | { ok: false; error: string };

/**
 * An upsert on the one-per-person-per-title key: sending the same title again
 * brings it back to the top of their bell, unread and undismissed, rather than
 * failing or stacking a second copy.
 */
export async function recommendTitle(
  userId: string,
  toUserId: string,
  title: { mediaType: "movie" | "tv"; tmdbId: number; title: string; poster: string | null },
  now = new Date(),
): Promise<RecommendOutcome> {
  if (toUserId === userId) return { ok: false, error: "You already know about this one" };
  const friends = await friendsOf(userId);
  if (!friends.some((f) => f.id === toUserId)) return { ok: false, error: "Only friends can be sent a title" };

  const key = { fromUserId: userId, toUserId, mediaType: title.mediaType, tmdbId: title.tmdbId };
  await db.recommendation.upsert({
    where: { fromUserId_toUserId_mediaType_tmdbId: key },
    create: { ...key, title: title.title, poster: title.poster, createdAt: now },
    update: { title: title.title, poster: title.poster, createdAt: now, seenAt: null, dismissedAt: null },
  });
  return { ok: true };
}
