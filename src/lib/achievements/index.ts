import "server-only";
import { db } from "../db";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  CATEGORIES,
  type Achievement,
  type Category,
  type EvidenceItem,
  type Tier,
} from "./catalogue";
import { syncChallenges } from "../challenges";
import { buildSnapshot } from "./snapshot";
import { classifyUnlocks, syncLevelBonuses } from "./xp";

export type { Category, Tier, EvidenceItem } from "./catalogue";
export { CATEGORIES } from "./catalogue";
export { absorbImport, getLevel, type LevelState, type XpSource } from "./xp";

/** One achievement as the interface needs it: definition plus where you are. */
export type AchievementState = {
  id: string;
  name: string;
  description: string;
  category: Category;
  tier: Tier;
  icon: string;
  /** Where you are, capped at the target. */
  progress: number;
  target: number;
  /** 0-100. Always 0 or 100 for the ones with nothing to count. */
  percent: number;
  unlocked: boolean;
  unlockedAt: Date | null;
  /** Reads as "7 / 30", or "42h / 100h" for the time-based ones. */
  label: string;
  detail: string | null;
  /** Nothing to show a bar for — it is a yes or no. */
  binary: boolean;
};

export type AchievementBoard = {
  achievements: AchievementState[];
  unlockedCount: number;
  total: number;
  /** Share of the whole set earned, 0-100. */
  percent: number;
  /** Newly earned in this pass, for the "just unlocked" strip. */
  justUnlocked: AchievementState[];
  /**
   * Titles still waiting for their first TMDB lookup. Genre, language and
   * franchise achievements read low until this reaches zero.
   */
  pendingLookups: number;
};

function formatUnit(value: number, unit: Achievement["unit"]) {
  if (unit !== "minutes") return value.toLocaleString("en-GB");
  const hours = Math.round(value / 60);
  return `${hours.toLocaleString("en-GB")}h`;
}

/**
 * Evaluates every achievement against the user's history and records anything
 * newly earned.
 *
 * Progress is always recomputed rather than stored: the numbers move whenever
 * anything is logged, and a counter kept in the database would drift the first
 * time a row was deleted. Only the moment of unlocking is written down, because
 * that is the one fact the history cannot produce again.
 */
export async function getAchievementBoard(userId: string): Promise<AchievementBoard> {
  const [snapshot, unlockedRows] = await Promise.all([
    buildSnapshot(userId),
    db.unlockedAchievement.findMany({ where: { userId } }),
  ]);

  const unlockedAt = new Map(unlockedRows.map((row) => [row.key, row.unlockedAt]));
  const fresh: string[] = [];

  const achievements = ACHIEVEMENTS.map((achievement) => {
    const measured = achievement.measure(snapshot);
    const progress = Math.min(Math.max(0, Math.round(measured.progress)), achievement.target);
    const earned = progress >= achievement.target;

    // An achievement someone earned before keeps its badge even if the number
    // behind it has since fallen — deleting a watched row should not confiscate
    // something they did do.
    const previously = unlockedAt.get(achievement.id) ?? null;
    if (earned && !previously) fresh.push(achievement.id);

    const unlocked = earned || previously !== null;

    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      category: achievement.category,
      tier: achievement.tier,
      icon: achievement.icon,
      progress,
      target: achievement.target,
      percent: unlocked
        ? 100
        : Math.min(99, Math.floor((progress / achievement.target) * 100)),
      unlocked,
      unlockedAt: previously,
      label: achievement.binary
        ? unlocked
          ? "Earned"
          : "Not yet"
        : `${formatUnit(progress, achievement.unit)} / ${formatUnit(
            achievement.target,
            achievement.unit,
          )}`,
      detail: measured.detail ?? null,
      binary: achievement.binary === true,
    } satisfies AchievementState;
  });

  // Always, not only when something unlocked: the catalogue has to be recorded
  // as seen even on a pass where nothing was earned, or every achievement would
  // keep reading as new.
  const carried = await classifyUnlocks(
    userId,
    fresh,
    ACHIEVEMENTS.map((a) => a.id),
  );

  if (fresh.length > 0) {
    const now = new Date();
    await db.unlockedAchievement
      .createMany({
        data: fresh.map((key) => ({
          userId,
          key,
          unlockedAt: now,
          carried: carried.has(key),
        })),
      })
      .catch(() => undefined);

    for (const state of achievements) {
      if (fresh.includes(state.id)) state.unlockedAt = now;
    }
  }

  // This pass has already paid TMDB for the two answers the level cannot work
  // out on its own, so it writes them down on the way past. Awaited, and it is
  // one small update: the page asks for the level immediately afterwards, and
  // should get this visit's numbers rather than the previous visit's.
  await syncLevelBonuses(
    userId,
    {
      finishedShows: snapshot.finishedShows,
      finishedFranchises: snapshot.franchises.filter((f) => f.owned >= f.total).length,
    },
    { partial: snapshot.pendingLookups > 0 },
  );

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return {
    achievements,
    unlockedCount,
    total: achievements.length,
    percent: Math.round((unlockedCount / achievements.length) * 100),
    justUnlocked: achievements.filter((a) => fresh.includes(a.id)),
    pendingLookups: snapshot.pendingLookups,
  };
}

/**
 * How long to leave a user alone between background unlock checks. Nothing here
 * is time-critical — "you earned a badge" a minute or two after the fact is
 * indistinguishable from instant — and the cap is what stops a run of episode
 * ticks from recomputing the whole board once each.
 */
const SYNC_EVERY_MS = 2 * 60 * 1000;
const lastSync = new Map<string, number>();

/**
 * Records anything newly earned, without drawing the board.
 *
 * The full `getAchievementBoard` only runs when someone opens the achievements
 * page, so unlocks used to be discovered there and nowhere else — which is no
 * use to a notification, since by the time it appeared you would already be
 * looking at the badge. This is the same evaluation with the reporting stripped
 * out and the network turned off, cheap enough to run after tracking something.
 *
 * Returns the keys of whatever was newly earned, so a caller can announce it.
 */
export async function syncUnlocks(
  userId: string,
  options: { carried?: boolean } = {},
): Promise<string[]> {
  const [snapshot, unlockedRows] = await Promise.all([
    buildSnapshot(userId, { offline: true }),
    db.unlockedAchievement.findMany({ where: { userId }, select: { key: true } }),
  ]);

  const known = new Set(unlockedRows.map((row) => row.key));

  const fresh = ACHIEVEMENTS.filter((achievement) => {
    if (known.has(achievement.id)) return false;
    const { progress } = achievement.measure(snapshot);
    return Math.round(progress) >= achievement.target;
  }).map((achievement) => achievement.id);

  const carried = await classifyUnlocks(
    userId,
    fresh,
    ACHIEVEMENTS.map((a) => a.id),
  );

  if (fresh.length === 0) return [];

  const now = new Date();
  await db.unlockedAchievement
    .createMany({
      data: fresh.map((key) => ({
        userId,
        key,
        unlockedAt: now,
        // Forced when an import is running: everything it turns up belongs to
        // the history it brought in.
        carried: options.carried === true || carried.has(key),
      })),
    })
    .catch(() => undefined);

  return fresh;
}

/**
 * Fires an unlock check off to one side, at most every couple of minutes per
 * user. Deliberately not awaited: logging an episode should not wait on a badge
 * that nobody has asked to see yet.
 *
 * The throttle is per process, like the Plex sync's. Losing it on a restart
 * costs one extra recomputation, and nothing double-unlocks either way — the
 * check is idempotent.
 */
export function scheduleUnlockCheck(userId: string) {
  const last = lastSync.get(userId) ?? 0;
  if (Date.now() - last < SYNC_EVERY_MS) return;
  lastSync.set(userId, Date.now());

  void syncUnlocks(userId).catch((error) => {
    console.error("Background achievement check failed", error);
  });

  // Same idea, same throttle: a challenge finished by the episode just logged
  // should be waiting in the bell rather than discovered on the next visit home.
  void syncChallenges(userId).catch((error) => {
    console.error("Background challenge check failed", error);
  });
}

export type AchievementEvidence = {
  caption: string;
  items: EvidenceItem[];
  /** Titles still waiting on TMDB, so a short list can say why. */
  pendingLookups: number;
};

/**
 * What earned one achievement.
 *
 * Only the evidence: the name, tier and progress are already on screen by the
 * time anyone asks for this, having come down with the wall. Fetching this
 * separately is what lets the dialog open instantly and fill in underneath,
 * rather than making a badge tap wait on the slowest query in the app.
 */
export async function getAchievementEvidence(
  userId: string,
  id: string,
): Promise<AchievementEvidence | null> {
  const achievement = ACHIEVEMENTS_BY_ID.get(id);
  if (!achievement) return null;

  const snapshot = await buildSnapshot(userId);
  const evidence = achievement.evidence?.(snapshot) ?? { caption: "", items: [] };

  return {
    caption: evidence.caption,
    items: evidence.items,
    pendingLookups: snapshot.pendingLookups,
  };
}

export type Badge = {
  id: string;
  name: string;
  description: string;
  tier: Tier;
  icon: string;
  unlockedAt: Date;
};

/**
 * Just the badges someone has earned, newest first — a plain table read with no
 * TMDB traffic behind it. This is what the profile pages show; working out how
 * close you are to the rest is the achievements page's job.
 */
export async function getBadges(userId: string, take?: number): Promise<Badge[]> {
  const rows = await db.unlockedAchievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });

  const badges = rows
    .map((row) => {
      const achievement = ACHIEVEMENTS_BY_ID.get(row.key);
      // A key that is no longer in the catalogue: the row stays, in case the
      // achievement comes back, but there is nothing to draw.
      if (!achievement) return null;

      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        tier: achievement.tier,
        icon: achievement.icon,
        unlockedAt: row.unlockedAt,
      } satisfies Badge;
    })
    .filter((badge): badge is Badge => badge !== null);

  return take === undefined ? badges : badges.slice(0, take);
}

export function achievementTotal() {
  return ACHIEVEMENTS.length;
}

export function byCategory(achievements: AchievementState[]) {
  return CATEGORIES.map((category) => ({
    category,
    items: achievements.filter((a) => a.category === category),
  })).filter((group) => group.items.length > 0);
}
