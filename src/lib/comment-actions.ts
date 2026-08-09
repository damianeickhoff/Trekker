"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "./db";
import { requireUser } from "./auth";
import { isFeeling, isReaction } from "./feelings";
import { COMMENT_LIMIT, checkLimit, describeWait, recordEvent } from "./rate-limit";

/**
 * Writing to the public half of a title page.
 *
 * Separate from `actions.ts` because none of this is tracking data: nothing here
 * earns XP, unlocks a badge or moves a challenge, and so nothing here should go
 * near `revalidateTracking` — that fires the achievement sweep, which reads the
 * whole play log on a synchronous driver. A comment invalidates the page it is
 * on and nothing else.
 *
 * Failures come back as a typed state rather than thrown, following
 * `recommend-actions.ts`: these are things a person did wrong in a textarea, and
 * an error boundary is a strange way to say "that is too long".
 */

const mediaType = z.enum(["movie", "tv"]);

const post = z.object({
  mediaType,
  tmdbId: z.number().int().positive(),
  // Long enough for a real thought about a film, short enough that one person
  // cannot own the page.
  body: z.string().trim().min(1).max(2000),
  parentId: z.string().min(1).nullable().optional(),
});

const react = z.object({
  commentId: z.string().min(1),
  emoji: z.string().min(1),
});

const feel = z.object({
  mediaType,
  tmdbId: z.number().int().positive(),
  feeling: z.string().min(1),
});

export type CommentState = { ok?: true; error?: string };

/** Both new sections live on the title page, and only there. */
function revalidateTitle(type: "movie" | "tv", tmdbId: number) {
  revalidatePath(`/title/${type}/${tmdbId}`);
}

export async function postComment(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  body: string;
  parentId?: string | null;
}): Promise<CommentState> {
  const user = await requireUser();

  const parsed = post.safeParse(input);
  if (!parsed.success) {
    return { error: "That is either empty or too long to post" };
  }
  const data = parsed.data;

  const gate = checkLimit(`comment:${user.id}`, COMMENT_LIMIT);
  if (!gate.allowed) {
    return { error: `That is a lot of comments at once. Try again ${describeWait(gate.retryInMs)}.` };
  }

  if (data.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: data.parentId },
      select: { parentId: true, mediaType: true, tmdbId: true },
    });

    if (!parent) return { error: "That comment is no longer there" };

    // One level, enforced here because SQL cannot say "the parent must be a
    // root". Without it the UI's indentation is the only thing holding the
    // shape, and anything posting straight to the action could nest for ever.
    if (parent.parentId !== null) {
      return { error: "Replies cannot be replied to" };
    }

    // A reply belongs to the conversation it was written in. Mismatched ids
    // would render it under the wrong film.
    if (parent.mediaType !== data.mediaType || parent.tmdbId !== data.tmdbId) {
      return { error: "That reply does not belong here" };
    }
  }

  await db.comment.create({
    data: {
      userId: user.id,
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
      body: data.body,
      parentId: data.parentId ?? null,
    },
  });

  recordEvent(`comment:${user.id}`, COMMENT_LIMIT);
  revalidateTitle(data.mediaType, data.tmdbId);
  return { ok: true };
}

/**
 * Takes back something you wrote. Your own only — and its replies with it,
 * which the foreign key does rather than this.
 */
export async function deleteComment(id: string): Promise<CommentState> {
  const user = await requireUser();

  const comment = await db.comment.findUnique({
    where: { id },
    select: { userId: true, mediaType: true, tmdbId: true },
  });

  if (!comment) return { ok: true };
  if (comment.userId !== user.id) return { error: "That is not yours to delete" };

  await db.comment.delete({ where: { id } });

  revalidateTitle(comment.mediaType === "movie" ? "movie" : "tv", comment.tmdbId);
  return { ok: true };
}

/**
 * Adds or takes back one emoji on one comment.
 *
 * The same emoji twice is the way to remove it — the unique key makes that the
 * only sensible reading, and it means the button both sets and unsets with no
 * third state to explain. Different emoji stack: agreeing and finding something
 * funny are not the same reaction.
 */
export async function toggleReaction(input: {
  commentId: string;
  emoji: string;
}): Promise<CommentState> {
  const user = await requireUser();

  const parsed = react.safeParse(input);
  if (!parsed.success) return { error: "That reaction does not exist" };

  // Checked against the list the buttons are drawn from, so the column can
  // never hold something no client would render.
  if (!isReaction(parsed.data.emoji)) return { error: "That reaction does not exist" };

  const comment = await db.comment.findUnique({
    where: { id: parsed.data.commentId },
    select: { mediaType: true, tmdbId: true },
  });
  if (!comment) return { error: "That comment is no longer there" };

  const key = {
    commentId_userId_emoji: {
      commentId: parsed.data.commentId,
      userId: user.id,
      emoji: parsed.data.emoji,
    },
  };

  const existing = await db.commentReaction.findUnique({ where: key, select: { id: true } });

  if (existing) await db.commentReaction.delete({ where: key });
  else {
    await db.commentReaction.create({
      data: { commentId: parsed.data.commentId, userId: user.id, emoji: parsed.data.emoji },
    });
  }

  revalidateTitle(comment.mediaType === "movie" ? "movie" : "tv", comment.tmdbId);
  return { ok: true };
}

/**
 * Picks how a title made you feel, or takes the answer back.
 *
 * Sending the feeling you already hold clears it, exactly as `rateEpisode` does
 * for an episode thumb — one control, two directions, nothing to explain.
 */
export async function setFeeling(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  feeling: string;
}): Promise<CommentState & { feeling?: string | null }> {
  const user = await requireUser();

  const parsed = feel.safeParse(input);
  if (!parsed.success || !isFeeling(parsed.data.feeling)) {
    return { error: "That feeling does not exist" };
  }
  const data = parsed.data;

  const key = {
    userId_mediaType_tmdbId: {
      userId: user.id,
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
    },
  };

  const existing = await db.feeling.findUnique({ where: key, select: { feeling: true } });

  if (existing?.feeling === data.feeling) {
    await db.feeling.delete({ where: key }).catch(() => undefined);
    revalidateTitle(data.mediaType, data.tmdbId);
    return { ok: true, feeling: null };
  }

  await db.feeling.upsert({
    where: key,
    create: {
      userId: user.id,
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
      feeling: data.feeling,
    },
    update: { feeling: data.feeling },
  });

  revalidateTitle(data.mediaType, data.tmdbId);
  return { ok: true, feeling: data.feeling };
}
