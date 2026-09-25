"use server";

import { updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import { bellTag, dismissAll, markAllRead, markRead } from "./notifications";

/*
 * Read marks, and clearing. They expire this person's cached bell and nothing else; the
 * bell fetches again itself, so there is no page to re-render.
 */

export async function readAll(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markAllRead(user.id);
  updateTag(bellTag(user.id));
}

/** Clears the list: everything on it goes, not just greys out. */
export async function clearAll(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await dismissAll(user.id);
  updateTag(bellTag(user.id));
}

export async function readOne(key: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || typeof key !== "string") return;
  await markRead(user.id, key);
  updateTag(bellTag(user.id));
}
