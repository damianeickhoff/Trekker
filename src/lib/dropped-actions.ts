"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { db } from "./db";

/**
 * "Stop watching" — a show you have given up on.
 *
 * The watched episodes stay exactly where they are; this only says stop asking.
 * The show drops out of Up next and out of the calendar's "you are behind on"
 * list, and its unwatched episodes stop counting as a backlog.
 */
export async function setShowDropped(input: {
  showId: number;
  showName: string;
  dropped: boolean;
}) {
  const user = await requireUser();

  if (input.dropped) {
    await db.droppedShow.upsert({
      where: { userId_showId: { userId: user.id, showId: input.showId } },
      create: { userId: user.id, showId: input.showId, showName: input.showName },
      update: {},
    });
  } else {
    await db.droppedShow
      .delete({ where: { userId_showId: { userId: user.id, showId: input.showId } } })
      .catch(() => undefined);
  }

  revalidatePath("/", "layout");
  return { dropped: input.dropped };
}
