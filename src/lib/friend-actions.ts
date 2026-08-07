"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { db } from "./db";

export type FriendActionState = { error?: string; ok?: string };

function refresh() {
  revalidatePath("/", "layout");
}

export async function sendFriendRequest(targetId: string): Promise<FriendActionState> {
  const user = await requireUser();
  if (targetId === user.id) return { error: "You are already friends with yourself" };

  const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) return { error: "That profile no longer exists" };

  const existing = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: targetId },
        { requesterId: targetId, addresseeId: user.id },
      ],
    },
  });

  if (existing?.status === "accepted") return { ok: "You are already friends" };

  // They asked first: answering with a request of your own is an acceptance.
  if (existing) {
    if (existing.requesterId === targetId) {
      await db.friendship.update({
        where: { id: existing.id },
        data: { status: "accepted", respondedAt: new Date() },
      });
      refresh();
      return { ok: "You are now friends" };
    }
    return { ok: "Request already sent" };
  }

  await db.friendship.create({
    data: { requesterId: user.id, addresseeId: targetId, status: "pending" },
  });

  refresh();
  return { ok: "Request sent" };
}

export async function acceptFriendRequest(requestId: string): Promise<FriendActionState> {
  const user = await requireUser();

  const request = await db.friendship.findUnique({ where: { id: requestId } });
  // Only the person who was asked can accept.
  if (!request || request.addresseeId !== user.id) return { error: "That request is gone" };

  await db.friendship.update({
    where: { id: requestId },
    data: { status: "accepted", respondedAt: new Date() },
  });

  refresh();
  return { ok: "You are now friends" };
}

export async function declineFriendRequest(requestId: string): Promise<FriendActionState> {
  const user = await requireUser();

  const request = await db.friendship.findUnique({ where: { id: requestId } });
  // Either side can tear down a pending request: declining, or withdrawing.
  if (!request || (request.addresseeId !== user.id && request.requesterId !== user.id)) {
    return { error: "That request is gone" };
  }

  await db.friendship.delete({ where: { id: requestId } });

  refresh();
  return { ok: "Request removed" };
}

export async function removeFriend(otherId: string): Promise<FriendActionState> {
  const user = await requireUser();

  await db.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: otherId },
        { requesterId: otherId, addresseeId: user.id },
      ],
    },
  });

  refresh();
  return { ok: "Friend removed" };
}
