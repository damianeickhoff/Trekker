import "server-only";
import { db } from "./db";
import { getFriendIds } from "./friends";

/**
 * What everyone else made of it, so your own score has something to sit against.
 * Friends first — a number from someone whose taste you know is worth more than
 * a global average.
 */

export type RatingContext = {
  /** Average of your friends' scores, when any of them have rated it. */
  friendsAverage: number | null;
  friendsCount: number;
  /** One friend's name, to make the line read as people rather than numbers. */
  friendName: string | null;
  /** TMDB's audience score, 0-100. */
  audience: number | null;
};

export async function getRatingContext(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
  audience: number | null,
): Promise<RatingContext> {
  const friendIds = await getFriendIds(userId);

  if (friendIds.length === 0) {
    return { friendsAverage: null, friendsCount: 0, friendName: null, audience };
  }

  const ratings = await db.rating.findMany({
    where: { userId: { in: friendIds }, mediaType, tmdbId },
    select: { score: true, user: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  if (ratings.length === 0) {
    return { friendsAverage: null, friendsCount: 0, friendName: null, audience };
  }

  return {
    friendsAverage: Math.round(
      ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length,
    ),
    friendsCount: ratings.length,
    friendName: ratings[0].user.name.split(" ")[0],
    audience,
  };
}
