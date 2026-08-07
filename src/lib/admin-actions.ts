"use server";

import { revalidatePath } from "next/cache";
import { ACHIEVEMENTS_BY_ID } from "./achievements/catalogue";
import { isAdmin } from "./admin";
import { getCurrentUser } from "./auth";
import { db } from "./db";

/**
 * Taking badges back.
 *
 * A maintenance tool, not a feature: the point is being able to fix an
 * achievement that unlocked when it should not have, and to test one twice
 * without inventing a second account. Restricted to the instance's admin, on
 * anybody including themselves.
 *
 * The badge is the only thing removed. The watch history behind it is left
 * exactly as it was — clearing a badge is saying "this was wrongly awarded",
 * not "this never happened", and the two must not be confused. Whatever earned
 * it will earn it again on the next evaluation unless the history changes too,
 * which is precisely what makes it useful for testing.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user;
}

export type ClearResult = { error?: string; cleared?: number };

export async function clearAchievement(userId: string, key: string): Promise<ClearResult> {
  if (!(await requireAdmin())) return { error: "Not allowed" };
  if (!ACHIEVEMENTS_BY_ID.has(key)) return { error: "No such achievement" };

  const { count } = await db.unlockedAchievement.deleteMany({ where: { userId, key } });

  // The key stays in `levelKnownKeys`, so if it is earned again it counts as
  // earned rather than carried — which is what you want when re-testing.
  revalidatePath("/", "layout");
  return { cleared: count };
}

export async function clearAllAchievements(userId: string): Promise<ClearResult> {
  if (!(await requireAdmin())) return { error: "Not allowed" };

  const { count } = await db.unlockedAchievement.deleteMany({ where: { userId } });

  revalidatePath("/", "layout");
  return { cleared: count };
}

/**
 * Clears this month's completed challenges, so the same three can be won again.
 * Same reasoning as above: the plays behind them are untouched.
 */
export async function clearChallenges(userId: string, period: string): Promise<ClearResult> {
  if (!(await requireAdmin())) return { error: "Not allowed" };

  const { count } = await db.challengeRun.deleteMany({ where: { userId, period } });

  revalidatePath("/", "layout");
  return { cleared: count };
}

/** Everyone on the instance, for the picker. */
export async function listAccounts() {
  if (!(await requireAdmin())) return [];

  return db.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
}

/** What one account currently holds, for the panel to draw. */
export async function accountBadges(userId: string) {
  if (!(await requireAdmin())) return [];

  const rows = await db.unlockedAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });

  return rows
    .map((row) => {
      const achievement = ACHIEVEMENTS_BY_ID.get(row.key);
      if (!achievement) return null;
      return {
        key: row.key,
        name: achievement.name,
        tier: achievement.tier,
        icon: achievement.icon,
        carried: row.carried,
        unlockedAt: row.unlockedAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
