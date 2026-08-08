"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "./auth";
import { avatarUrl } from "./avatar";
import { db } from "./db";
import { getFriendIds } from "./friends";

/**
 * Handing a title to somebody.
 *
 * Friends only, checked against `getFriendIds` — the same single gate every
 * other social read in the app goes through. Without it this would be a way to
 * put an arbitrary poster and an arbitrary line of text in a stranger's
 * notifications, which is the shape of every unsolicited-message problem there
 * is.
 */

const input = z.object({
  toUserId: z.string().min(1),
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
  title: z.string().min(1).max(300),
  poster: z.string().max(300).nullable().optional(),
  // Long enough for a reason, short enough that it stays a nudge.
  note: z.string().max(280).nullable().optional(),
});

export type RecommendState = { ok?: string; error?: string };

/** Who this title can be sent to, and who already has it. */
export async function recommendTargets(mediaType: "movie" | "tv", tmdbId: number) {
  const user = await requireUser();
  const friendIds = await getFriendIds(user.id);
  if (friendIds.length === 0) return [];

  const [friends, already] = await Promise.all([
    db.user.findMany({
      where: { id: { in: friendIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, avatarSetAt: true },
    }),
    db.recommendation.findMany({
      where: { fromUserId: user.id, mediaType, tmdbId },
      select: { toUserId: true },
    }),
  ]);

  const sent = new Set(already.map((row) => row.toUserId));

  return friends.map((friend) => ({
    id: friend.id,
    name: friend.name,
    avatar: avatarUrl(friend),
    sent: sent.has(friend.id),
  }));
}

export async function recommendTitle(raw: unknown): Promise<RecommendState> {
  const user = await requireUser();

  const parsed = input.safeParse(raw);
  if (!parsed.success) return { error: "That does not look right" };

  const { toUserId, mediaType, tmdbId, title, poster, note } = parsed.data;

  if (toUserId === user.id) return { error: "You already know about this one" };

  const friendIds = await getFriendIds(user.id);
  if (!friendIds.includes(toUserId)) {
    return { error: "You can only recommend things to friends" };
  }

  /**
   * Upsert rather than create: sending the same title twice should update the
   * note and un-dismiss it, not fail on the unique index or stack up duplicates
   * in the recipient's bell.
   */
  await db.recommendation.upsert({
    where: {
      fromUserId_toUserId_mediaType_tmdbId: {
        fromUserId: user.id,
        toUserId,
        mediaType,
        tmdbId,
      },
    },
    create: {
      fromUserId: user.id,
      toUserId,
      mediaType,
      tmdbId,
      title,
      poster: poster ?? null,
      note: note?.trim() || null,
    },
    update: {
      note: note?.trim() || null,
      createdAt: new Date(),
      seenAt: null,
      dismissedAt: null,
    },
  });

  // The recipient's bell is rendered in the layout, so the whole tree.
  revalidatePath("/", "layout");
  return { ok: "Sent" };
}

/** Clears one from your own list. Kept rather than deleted, so it stays quiet. */
export async function dismissRecommendation(id: string) {
  const user = await requireUser();

  await db.recommendation.updateMany({
    // Scoped to the recipient: only the person it was sent to can put it away.
    where: { id, toUserId: user.id },
    data: { dismissedAt: new Date() },
  });

  revalidatePath("/", "layout");
}
