"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { ACHIEVEMENTS_BY_ID } from "./achievements/catalogue";
import { isAdmin } from "./admin";
import { getCurrentUser } from "./auth";
import { db } from "./db";
import { displayEmail } from "./plex-seat";

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

/** Everyone on the instance, for the pickers. */
export async function listAccounts() {
  if (!(await requireAdmin())) return [];

  const rows = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      plexManaged: true,
      plexAccountId: true,
      passwordHash: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // The hash itself stays on the server; the client only needs to know which
  // sign-in routes an account has, to label it and to grey out what cannot
  // apply. A managed profile's placeholder address is nothing anybody should
  // see, so the display form goes out instead.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: displayEmail(row.email),
    managed: row.plexManaged,
    plexLinked: Boolean(row.plexAccountId),
    hasPassword: Boolean(row.passwordHash),
  }));
}

/* ==========================================================================
 * Account management
 *
 * The household problems the login page cannot solve: somebody forgot their
 * password and there is no email infrastructure to reset it through, a managed
 * profile needs its display name fixed, an account belongs to somebody who
 * moved out. All admin-only, and none of it applies to the admin's own row —
 * their own password change (which proves the current one) and their own
 * delete (which guards the instance settings) already exist under "You", and
 * this tool must not become the way around those checks.
 * ======================================================================== */

export type AccountResult = { error?: string; ok?: true };

/**
 * Finds the target and says why it cannot be touched, or hands it back.
 * Working on your own row is refused for every tool here — see above.
 */
async function targetAccount(adminId: string, userId: string) {
  if (userId === adminId) {
    return { error: "Your own account is managed under You, not here" as const };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, plexManaged: true },
  });
  if (!target) return { error: "That account is gone" as const };

  return { target };
}

export async function renameAccount(userId: string, name: string): Promise<AccountResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not allowed" };

  const found = await targetAccount(admin.id, userId);
  if ("error" in found) return { error: found.error };

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) return { error: "A name is 1 to 60 characters" };

  await db.user.update({ where: { id: userId }, data: { name: trimmed } });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Sets a new password on somebody else's account.
 *
 * The recovery story for an instance with no email: the admin sets a password
 * across the kitchen table and the owner changes it themselves afterwards.
 * Every session the account had is ended with it — the person asking for a
 * reset is saying they may not control where it is still signed in.
 */
export async function resetAccountPassword(
  userId: string,
  password: string,
): Promise<AccountResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not allowed" };

  const found = await targetAccount(admin.id, userId);
  if ("error" in found) return { error: found.error };

  // Same rule as changing one's own: a managed Plex Home profile is reached
  // through the household and must never become signable-into directly.
  if (found.target.plexManaged) {
    return { error: "Managed Plex profiles sign in through the main account" };
  }

  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      tokenVersion: { increment: 1 },
    },
  });

  return { ok: true };
}

/**
 * Removes an account and everything it logged, by cascade — the same scope as
 * the owner closing it themselves. Confirmed by typing the account's name,
 * checked here rather than in the browser: the server is the one doing the
 * deleting, so the server is the one that hears the confirmation.
 */
export async function removeAccount(userId: string, confirmName: string): Promise<AccountResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not allowed" };

  const found = await targetAccount(admin.id, userId);
  if ("error" in found) return { error: found.error };

  if (confirmName.trim().toLowerCase() !== found.target.name.trim().toLowerCase()) {
    return { error: "Type the account's name exactly to confirm" };
  }

  await db.user.delete({ where: { id: userId } });

  revalidatePath("/", "layout");
  return { ok: true };
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
