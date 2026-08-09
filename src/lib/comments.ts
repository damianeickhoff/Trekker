import "server-only";
import { db } from "./db";
import { avatarUrl } from "./avatar";

/**
 * What everyone has said about a title, and how it made them feel.
 *
 * The one read in this app with no friend gate on it, which is the whole
 * feature — `getFriendReviews` beside it exists to be private, and this exists
 * to be public. Watch history and profiles are unaffected: knowing that somebody
 * commented on a film says nothing about what else they have watched.
 *
 * Assembled from a fixed number of queries rather than a nested include, so the
 * cost is the same whether a title has three comments or three hundred. The
 * driver is synchronous — see `db.ts` — so a per-comment read would block the
 * whole server, not just this request.
 */

export type CommentAuthor = {
  id: string;
  name: string;
  avatar: string | null;
};

export type CommentReaction = {
  emoji: string;
  count: number;
  /** Whether the person reading it is one of the people who reacted. */
  mine: boolean;
};

export type CommentNode = {
  id: string;
  body: string;
  createdAt: Date;
  author: CommentAuthor;
  /** True when the reader wrote it, which is what offers the delete control. */
  own: boolean;
  reactions: CommentReaction[];
  replies: CommentNode[];
};

export type FeelingTally = {
  /** A feeling id from `lib/feelings.ts`. */
  feeling: string;
  count: number;
};

const AUTHOR = { select: { id: true, name: true, avatarSetAt: true } };

export async function getComments(
  mediaType: "movie" | "tv",
  tmdbId: number,
  viewerId: string | null,
): Promise<CommentNode[]> {
  const rows = await db.comment.findMany({
    where: { mediaType, tmdbId },
    // Oldest first: a conversation reads downwards, and a reply above the thing
    // it answers is not a conversation.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      parentId: true,
      userId: true,
      user: AUTHOR,
    },
  });

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  // One aggregate for every tally on the page, and one read for the viewer's
  // own — rather than a count per comment, which is where this would have
  // turned into a query per row.
  const [tallies, mine] = await Promise.all([
    db.commentReaction.groupBy({
      by: ["commentId", "emoji"],
      where: { commentId: { in: ids } },
      _count: { _all: true },
    }),
    viewerId
      ? db.commentReaction.findMany({
          where: { commentId: { in: ids }, userId: viewerId },
          select: { commentId: true, emoji: true },
        })
      : Promise.resolve([]),
  ]);

  const own = new Set(mine.map((row) => `${row.commentId}:${row.emoji}`));

  const reactionsFor = (commentId: string): CommentReaction[] =>
    tallies
      .filter((row) => row.commentId === commentId)
      .map((row) => ({
        emoji: row.emoji,
        count: row._count._all,
        mine: own.has(`${commentId}:${row.emoji}`),
      }))
      // Most-reacted first, then by emoji so the order cannot wobble between
      // renders when two are level.
      .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));

  const node = (row: (typeof rows)[number]): CommentNode => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    author: {
      id: row.user.id,
      name: row.user.name,
      avatar: avatarUrl(row.user),
    },
    own: row.userId === viewerId,
    reactions: reactionsFor(row.id),
    replies: [],
  });

  const roots = new Map<string, CommentNode>();
  for (const row of rows) {
    if (row.parentId === null) roots.set(row.id, node(row));
  }

  for (const row of rows) {
    if (row.parentId === null) continue;
    // A reply whose parent is gone cannot happen — the foreign key cascades —
    // but a reply to something on another title would be a bug worth dropping
    // rather than rendering in the wrong conversation.
    roots.get(row.parentId)?.replies.push(node(row));
  }

  return [...roots.values()];
}

/**
 * The feelings on a title, and which one the reader picked.
 *
 * Two queries whatever the audience: a `groupBy` for the tally, and the reader's
 * own row. Feelings that nobody chose are absent rather than zero — the caller
 * draws every option from `FEELINGS` and looks the count up.
 */
export async function getFeelings(
  mediaType: "movie" | "tv",
  tmdbId: number,
  viewerId: string | null,
): Promise<{ tally: FeelingTally[]; mine: string | null }> {
  const [grouped, mine] = await Promise.all([
    db.feeling.groupBy({
      by: ["feeling"],
      where: { mediaType, tmdbId },
      _count: { _all: true },
    }),
    viewerId
      ? db.feeling.findUnique({
          where: { userId_mediaType_tmdbId: { userId: viewerId, mediaType, tmdbId } },
          select: { feeling: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    tally: grouped.map((row) => ({ feeling: row.feeling, count: row._count._all })),
    mine: mine?.feeling ?? null,
  };
}
