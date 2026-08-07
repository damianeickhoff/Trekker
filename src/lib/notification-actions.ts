"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./auth";
import { dismissAll, markAllRead, markRead } from "./notification-centre";

/**
 * Only async functions may live in here — every export of a `"use server"` file
 * becomes a callable endpoint. Types and constants belong in
 * `notification-centre.ts`.
 */

export async function markNotificationRead(key: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await markRead(user.id, key);
  // The bell is rendered by the root layout, so its count lives on every page.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await markAllRead(user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearNotifications() {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await dismissAll(user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
