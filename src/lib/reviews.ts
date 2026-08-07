import "server-only";
import { avatarUrl } from "./avatar";
import { db } from "./db";
import { getFriendIds } from "./friends";

/**
 * Reviews written by people you actually know, for one title.
 *
 * A review lives on the `Rating` row rather than in a table of its own: you
 * cannot write about something you have not scored, and keeping them together
 * means a score and the paragraph explaining it can never disagree about which
 * title they belong to.
 *
 * Only friends — never the whole instance. `getFriendIds` is the same gate the
 * rest of the app reads through, so an unaccepted request shows nothing.
 */

export type FriendReview = {
  id: string;
  authorId: string;
  author: string;
  avatar: string | null;
  score: number;
  review: string;
  updatedAt: Date;
};

export async function getFriendReviews(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<FriendReview[]> {
  const friendIds = await getFriendIds(userId);
  if (friendIds.length === 0) return [];

  const rows = await db.rating.findMany({
    where: {
      userId: { in: friendIds },
      mediaType,
      tmdbId,
      NOT: { review: null },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      score: true,
      review: true,
      updatedAt: true,
      user: { select: { id: true, name: true, avatarSetAt: true } },
    },
  });

  return rows
    // `NOT: { review: null }` catches the nulls; a row left holding whitespace
    // is still nothing to read.
    .filter((row) => row.review!.trim().length > 0)
    .map((row) => ({
      id: row.id,
      authorId: row.user.id,
      author: row.user.name,
      avatar: avatarUrl(row.user),
      score: row.score,
      review: row.review!.trim(),
      updatedAt: row.updatedAt,
    }));
}
