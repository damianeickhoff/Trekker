"use server";

import { getCurrentUser } from "./auth";
import { db } from "./db";

/**
 * Folds the badges page's XP breakdown away, or back. On the account so the
 * choice follows the person between devices; the panel already shows the new
 * state, so nothing needs re-rendering.
 */
export async function setXpPanelCollapsed(collapsed: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await db.user.update({ where: { id: user.id }, data: { xpPanelCollapsed: collapsed === true } });
}
