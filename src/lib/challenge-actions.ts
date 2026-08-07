"use server";

import { getCurrentUser } from "./auth";
import { db } from "./db";

/**
 * Folds the dashboard's challenge strip away, or opens it again.
 *
 * Stored on the account rather than in the browser so the choice follows you
 * between devices — it is a preference about the app, not about one screen.
 * Deliberately not revalidating: the strip flips itself the moment it is
 * pressed and this is only what makes it survive a reload, so redrawing the
 * whole dashboard for it would be motion for nothing.
 */
export async function setChallengesCollapsed(collapsed: boolean) {
  const user = await getCurrentUser();
  if (!user) return;

  await db.user
    .update({ where: { id: user.id }, data: { challengesCollapsed: collapsed } })
    .catch(() => undefined);
}
