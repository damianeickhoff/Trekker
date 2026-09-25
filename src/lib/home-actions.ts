"use server";

import { getCurrentUser } from "./auth";
import { db } from "./db";

/**
 * Folds the challenge strip away, or back. On the account rather than in the
 * browser so the choice follows the person between phone and desktop. The
 * strip already shows the new state; nothing needs re-rendering.
 */
export async function setChallengesCollapsed(collapsed: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await db.user.update({ where: { id: user.id }, data: { challengesCollapsed: collapsed === true } });
}
