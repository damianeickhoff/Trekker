import "server-only";
import { pastDay, todayKey } from "./dates";
import { db } from "./db";
import { isFeeling } from "./feelings";
import type { MediaType } from "./tmdb";

/**
 * How titles felt and what people said about them. Both are visible to
 * everyone signed in to this instance, which is the whole feature: knowing that
 * somebody commented on a film says nothing about what else they have watched.
 * Reviews, which are friends-only, are not read here.
 *
 * Fixed numbers of queries whatever the size of the conversation: the driver
 * is synchronous, so a read per comment would block the whole server.
 */

/** Which feelings: a film's own (0, 0), one episode's, or every episode of a show. */
export type FeelingScope = { season: number; episode: number } | "all-episodes";

export type FeelingTally = { counts: Record<string, number>; people: number; mine: string | null };

export async function feelingTally(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  scope: FeelingScope,
): Promise<FeelingTally> {
  const where =
    scope === "all-episodes"
      ? { mediaType, tmdbId }
      : { mediaType, tmdbId, seasonNumber: scope.season, episodeNumber: scope.episode };
  const rows = await db.feeling.findMany({ where, select: { userId: true, feeling: true } });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (!isFeeling(row.feeling)) continue;
    counts[row.feeling] = (counts[row.feeling] ?? 0) + 1;
  }
  const mine = scope === "all-episodes" ? null : (rows.find((r) => r.userId === userId)?.feeling ?? null);
  return { counts, people: new Set(rows.map((r) => r.userId)).size, mine };
}

export type CommentItem = {
  id: string;
  body: string;
  /** "yesterday", "Friday", "12 Mar": worked out here, so server and browser agree. */
  when: string;
  author: string;
  own: boolean;
  replies: CommentItem[];
};

/**
 * Everything said about a title, oldest first, since a conversation reads
 * downwards. One level of replies, as the current app wrote them.
 */
export async function commentsFor(viewerId: string, mediaType: MediaType, tmdbId: number): Promise<CommentItem[]> {
  const rows = await db.comment.findMany({
    where: { mediaType, tmdbId },
    orderBy: { createdAt: "asc" },
    select: { id: true, body: true, createdAt: true, parentId: true, userId: true, user: { select: { name: true } } },
  });

  const today = todayKey();
  const node = (r: (typeof rows)[number]): CommentItem => ({
    id: r.id,
    body: r.body,
    when: pastDay(todayKey(r.createdAt), today),
    author: r.user.name,
    own: r.userId === viewerId,
    replies: [],
  });

  const roots = new Map<string, CommentItem>();
  for (const r of rows) if (!r.parentId) roots.set(r.id, node(r));
  for (const r of rows) {
    if (!r.parentId) continue;
    // A reply to a reply hangs off the thread it belongs to.
    let parentId: string | null = r.parentId;
    let parent = roots.get(parentId);
    while (!parent && parentId) {
      parentId = rows.find((x) => x.id === parentId)?.parentId ?? null;
      parent = parentId ? roots.get(parentId) : undefined;
    }
    parent?.replies.push(node(r));
  }
  return [...roots.values()];
}

/** The longest comment accepted: a paragraph, not an essay. */
export const COMMENT_MAX = 1000;
