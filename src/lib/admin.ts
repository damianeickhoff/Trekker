import "server-only";
import type { IconName } from "@/components/icon";
import { ACHIEVEMENTS_BY_ID } from "./achievements/catalogue";
import { avatarUrl } from "./avatar";
import { db } from "./db";
import type { Tier } from "./levels";

/**
 * The instance's admin is the first account created: it holds the Plex and
 * Overseerr connections (`availabilitySources`), and it alone may take a
 * badge back. Not cached across requests, because an account deleted in
 * between would hand the role on, and the read is one indexed row.
 */
export async function adminId(): Promise<string | null> {
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return admin?.id ?? null;
}

export async function isAdmin(userId: string): Promise<boolean> {
  return (await adminId()) === userId;
}

export type Account = { id: string; name: string; avatar: string | null; badges: number; admin: boolean };

/** Everyone on this Trekker, oldest first, with how many badges each holds. */
export async function accountsForAdmin(): Promise<Account[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, avatarSetAt: true, _count: { select: { achievements: true } } },
  });
  return users.map((u, i) => ({
    id: u.id,
    name: u.name,
    avatar: avatarUrl(u),
    badges: u._count.achievements,
    admin: i === 0,
  }));
}

export type HeldBadge = { key: string; name: string; icon: IconName; tier: Tier; unlockedAt: string };

/** One account's badges, newest first. Unlocks the catalogue no longer knows are left out, as the board does. */
export async function badgesHeldBy(userId: string): Promise<HeldBadge[]> {
  const rows = await db.unlockedAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
    select: { key: true, unlockedAt: true },
  });
  return rows.flatMap((r) => {
    const a = ACHIEVEMENTS_BY_ID.get(r.key);
    return a ? [{ key: r.key, name: a.name, icon: a.icon, tier: a.tier, unlockedAt: r.unlockedAt.toISOString() }] : [];
  });
}

/**
 * Takes one badge back: the unlock row and nothing else. The history that
 * earned it stays, so a badge still deserved is earned again on its owner's
 * next visit to Badges, with a new moment and a fresh notification. That is
 * the point: it is how the admin tests an achievement twice, or undoes one
 * awarded by a bug once the bug is fixed.
 */
export async function takeBack(actingUserId: string, targetUserId: string, key: string): Promise<boolean> {
  if (!(await isAdmin(actingUserId))) return false;
  const { count } = await db.unlockedAchievement.deleteMany({ where: { userId: targetUserId, key } });
  return count > 0;
}
