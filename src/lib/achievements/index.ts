import "server-only";
import type { IconName } from "@/components/icon";
import { db } from "../db";
import type { Tier } from "../levels";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  GROUPS as GROUPS_LIST,
  evaluateAll,
  opensLabel,
  progressLabel,
  seasonOpen,
  type Group,
  type Snapshot,
} from "./catalogue";
import { buildSnapshot } from "./snapshot";
import { classifyUnlocks, syncLevelBonuses } from "./xp";

/**
 * Progress is always worked out afresh from the history; only the moment of
 * earning is stored, because it is the one thing the history cannot give back.
 * A badge once earned is kept even if the number behind it falls: deleting a
 * viewing never confiscates something that was done.
 */

export type BadgeState = {
  id: string;
  name: string;
  icon: IconName;
  description: string;
  group: Group;
  tier: Tier;
  earned: boolean;
  /** ISO, since it crosses into client components. */
  earnedAt: string | null;
  /** 0 to 100; 100 only when earned. */
  percent: number;
  /** The line under the name: when it was earned, how close, or when it opens. */
  sub: string;
  /** "3 to go", "40h to go"; null once earned, and for a badge with nothing to count. */
  toGo: string | null;
};

export type Board = {
  badges: BadgeState[];
  earned: number;
  /** Titles still waiting for their facts; genre and franchise badges read low until 0. */
  pending: number;
  /** Earned on this pass. */
  fresh: string[];
};

/** "5 Aug", with the year only when it is not this one: the mono line under a badge's description. */
export function earnedDay(at: Date, now: Date) {
  const sameYear = at.getFullYear() === now.getFullYear();
  return at.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/** The badges a snapshot meets. */
function met(s: Snapshot): Set<string> {
  return new Set(evaluateAll(s).filter((m) => m.progress >= ACHIEVEMENTS_BY_ID.get(m.id)!.target).map((m) => m.id));
}

/**
 * Writes new unlocks, deciding for each whether it was carried in with an
 * import: `history` is the snapshot cut down to what arrived with the account.
 */
async function recordUnlocks(userId: string, fresh: string[], history: Snapshot, now: Date) {
  const carried = await classifyUnlocks(
    userId,
    fresh,
    ACHIEVEMENTS.map((a) => a.id),
    fresh.length ? met(history) : new Set(),
  );
  if (fresh.length === 0) return;
  // createMany has no skip-duplicates on SQLite; two tabs racing to the same
  // unlock is settled by the unique key, and the loser changes nothing.
  for (const key of fresh) {
    await db.unlockedAchievement
      .create({ data: { userId, key, unlockedAt: now, carried: carried.has(key) } })
      .catch(() => undefined);
  }
}

const complete = (s: Snapshot) => s.franchises.filter((f) => f.owned >= f.total).length;

/**
 * One evaluation: every achievement measured, new unlocks written, and the
 * level's two completion counts brought up to date, since this pass has just
 * worked them out. `offline` reads rows and caches only.
 */
async function evaluate(userId: string, now: Date, { offline = false } = {}) {
  const [{ snapshot, history, pending }, stored] = await Promise.all([
    buildSnapshot(userId, { offline }),
    db.unlockedAchievement.findMany({ where: { userId }, select: { key: true, unlockedAt: true } }),
  ]);
  const unlockedAt = new Map(stored.map((r) => [r.key, r.unlockedAt]));
  const measured = evaluateAll(snapshot);

  const fresh = measured
    .filter((m) => m.progress >= ACHIEVEMENTS_BY_ID.get(m.id)!.target && !unlockedAt.has(m.id))
    .map((m) => m.id);
  await recordUnlocks(userId, fresh, history, now);
  for (const id of fresh) unlockedAt.set(id, now);

  await syncLevelBonuses(
    userId,
    { finishedShows: snapshot.finishedShows, finishedFranchises: complete(snapshot) },
    { partial: pending > 0, history: { finishedShows: history.finishedShows, finishedFranchises: complete(history) } },
  );
  return { measured, unlockedAt, pending, fresh };
}

/** What is left, in the badge's own unit. Hours round up, so it never says "0h to go" with minutes left. */
export function toGoLabel(left: number, unit?: "count" | "minutes") {
  const n = Math.max(1, left);
  if (unit === "minutes") return `${Math.ceil(n / 60).toLocaleString("en-GB")}h to go`;
  return `${n.toLocaleString("en-GB")} to go`;
}

/** The badges page's board, measured and written by `evaluate`. */
export async function boardFor(userId: string, now = new Date()): Promise<Board> {
  const { measured, unlockedAt, pending, fresh } = await evaluate(userId, now);

  const badges = measured.map((m): BadgeState => {
    const a = ACHIEVEMENTS_BY_ID.get(m.id)!;
    const at = unlockedAt.get(m.id) ?? null;
    const earned = at !== null;
    let sub: string;
    if (at) sub = `Earned ${earnedDay(at, now)}`;
    else if (m.progress === 0 && !seasonOpen(a, now)) sub = opensLabel(a)!;
    else if (a.binary) sub = m.detail ?? "Not yet";
    else sub = m.detail ?? progressLabel(a, m.progress);
    return {
      id: a.id,
      name: a.name,
      icon: a.icon,
      description: a.description,
      group: a.group,
      tier: a.tier,
      earned,
      earnedAt: at?.toISOString() ?? null,
      percent: earned ? 100 : Math.min(99, Math.floor((m.progress / a.target) * 100)),
      sub,
      toGo: earned || a.binary ? null : toGoLabel(a.target - m.progress, a.unit),
    };
  });

  return { badges, earned: badges.filter((b) => b.earned).length, pending, fresh };
}

/**
 * New unlocks from rows alone, without drawing anything: the check after a
 * viewing, so a badge reached from a title page is in the bell before anyone
 * opens the badges page. No network and no cache parsing; anything it cannot
 * see reads low, so it can only ever unlock later than the full pass, never
 * wrongly.
 */
export async function syncUnlocks(userId: string, now = new Date()): Promise<string[]> {
  const [{ snapshot, history }, stored] = await Promise.all([
    buildSnapshot(userId, { offline: true }),
    db.unlockedAchievement.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const have = new Set(stored.map((r) => r.key));
  const fresh = evaluateAll(snapshot)
    .filter((m) => !have.has(m.id) && m.progress >= ACHIEVEMENTS_BY_ID.get(m.id)!.target)
    .map((m) => m.id);
  await recordUnlocks(userId, fresh, history, now);
  return fresh;
}

/**
 * The first evaluation, run at server start for every account that has not
 * had one under the current rules (`levelRepairedAt`), so that a database
 * brought over from the old app reads the same level before anyone opens
 * Badges as after. Until an account has been evaluated, its stored state is
 * whatever the old app left: unlocks it never wrote, completion counts from its
 * own arithmetic, and a starting line that knew nothing of the history-only
 * snapshot. The level would then move on the first Badges visit, which is the
 * correction happening lazily. Offline, so boot never waits on TMDB; whatever
 * the lookups add later is judged against the history as it arrives.
 */
export async function repairLevels(now = new Date()) {
  const users = await db.user.findMany({ where: { levelRepairedAt: null }, select: { id: true } });
  for (const { id } of users) {
    try {
      await evaluate(id, now, { offline: true });
      await db.user.update({ where: { id }, data: { levelRepairedAt: now } });
    } catch (error) {
      // Left unflagged, so the next start tries again; the Badges pass still corrects it meanwhile.
      console.error(`level repair for ${id} failed`, error);
    }
  }
  return { users: users.length };
}

/**
 * Nothing about a badge is urgent: announced a minute after the tick is
 * indistinguishable from at once, and the gap is what stops a run of ticks
 * rebuilding the history once each. Per process, like the refresh queue.
 */
const CHECK_EVERY_MS = 2 * 60 * 1000;
const g = globalThis as unknown as { trekkerUnlockChecks?: Map<string, number> };
const lastCheck = (g.trekkerUnlockChecks ??= new Map());

/** Fire and forget, after a viewing. */
export function scheduleUnlockCheck(userId: string) {
  const now = Date.now();
  if (now - (lastCheck.get(userId) ?? 0) < CHECK_EVERY_MS) return;
  lastCheck.set(userId, now);
  void syncUnlocks(userId).catch((error) => console.error("unlock check failed", error));
}

export type CabinetBadge = { id: string; name: string; icon: IconName; tier: Tier; earnedAt: string };

/**
 * The trophy cabinet: what has been earned, newest first, straight off the
 * table. Someone's profile is a display case, not a to-do list, so nothing is
 * measured here. A key no longer in the catalogue stays stored but is not drawn.
 */
export async function cabinetFor(userId: string): Promise<CabinetBadge[]> {
  const rows = await db.unlockedAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
    select: { key: true, unlockedAt: true },
  });
  return rows.flatMap((r) => {
    const a = ACHIEVEMENTS_BY_ID.get(r.key);
    return a ? [{ id: a.id, name: a.name, icon: a.icon, tier: a.tier, earnedAt: r.unlockedAt.toISOString() }] : [];
  });
}

export { ACHIEVEMENTS, GROUPS, type Group } from "./catalogue";

/** Earned badges per group, from the stored unlocks alone: the chips and the level card, before the board has measured anything. */
export async function earnedByGroup(userId: string): Promise<{ counts: Record<Group, { earned: number; total: number }>; earned: number }> {
  const rows = await db.unlockedAchievement.findMany({ where: { userId }, select: { key: true } });
  const counts = Object.fromEntries(GROUPS_LIST.map((g) => [g, { earned: 0, total: 0 }])) as Record<Group, { earned: number; total: number }>;
  for (const a of ACHIEVEMENTS) counts[a.group].total += 1;
  let earned = 0;
  for (const r of rows) {
    const a = ACHIEVEMENTS_BY_ID.get(r.key);
    if (!a) continue;
    counts[a.group].earned += 1;
    earned += 1;
  }
  return { counts, earned };
}
