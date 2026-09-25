import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { boardFor, repairLevels, syncUnlocks } from "@/lib/achievements";
import { computeXp } from "@/lib/achievements/xp";
import { db } from "@/lib/db";
import { BADGE_XP, XP } from "@/lib/levels";
import { recordPlay } from "@/lib/plays";
import { cacheKey } from "@/lib/tmdb";
import { ACHIEVEMENTS_BY_ID } from "@/lib/achievements/catalogue";
import { episode, film, freshUser } from "./helpers/db";

/**
 * The level's one promise to someone who brought their history with them:
 * opening Badges never moves it. Only watching something here does.
 *
 * The owner's database showed the failure: a history migrated with its badges
 * and its starting line already drawn, whose title facts were still arriving.
 * Each Badges visit found more genre and franchise badges met by the old
 * history, and more franchises complete, and paid for them as if they had
 * just been watched.
 */

const LOTR = [120, 121, 122];

/** Facts for a film, as the badges page would have gathered them from TMDB. */
async function facts(tmdbId: number, genres: string, extra: Record<string, unknown> = {}) {
  await db.titleMeta.create({
    data: { mediaType: "movie", tmdbId, title: `Film ${tmdbId}`, genres, releaseDate: "2001-12-19", ...extra },
  });
}

/** TMDB's answer for a collection, cached, so the franchise counts as complete without the network. */
async function collection(id: number, parts: number[]) {
  const body = { id, name: "The Lord of the Rings Collection", parts: parts.map((p) => ({ id: p, release_date: "2001-12-19" })) };
  await db.tmdbCache.create({
    data: { key: cacheKey(`/collection/${id}`, {}), body: JSON.stringify(body), expiresAt: new Date(Date.now() + 3_600_000) },
  });
}

/** Someone who arrived with years of history and whose title facts had not been looked up yet. */
async function importedAccount() {
  const userId = (await freshUser()).id;
  for (const [i, tmdbId] of LOTR.entries()) {
    await recordPlay(userId, { ...film({ tmdbId, title: `Part ${i + 1}` }), source: "trakt", watchedAt: new Date(2019, 2, 1 + i, 20) });
  }
  // Horror on Halloween, years ago: a seasonal badge the history meets once its genre is known.
  await recordPlay(userId, { ...film({ tmdbId: 900, title: "Scary" }), source: "trakt", watchedAt: new Date(2020, 9, 31, 21) });
  return userId;
}

describe("the Trekker level with an imported history", () => {
  it("is the same before and after the Badges pass, however late the facts arrive; only a native play moves it", async () => {
    const userId = await importedAccount();

    // The first pass draws the starting line with the facts still missing.
    await boardFor(userId);
    const before = await computeXp(userId);
    expect(before.trekker).toBe(0);

    // A week on, the lookups land: the franchise is known and complete, the Halloween film is horror.
    for (const id of LOTR) await facts(id, "Adventure,Fantasy", { collectionId: 119, collectionName: "The Lord of the Rings Collection" });
    await facts(900, "Horror");
    await collection(119, LOTR);

    const quick = await syncUnlocks(userId);
    const board = await boardFor(userId);
    const newlyMet = [...quick, ...board.fresh];
    expect(newlyMet).toEqual(expect.arrayContaining(["franchise-lord-of-the-rings", "all-hallows-eve"]));

    const after = await computeXp(userId);
    expect(after.trekker).toBe(before.trekker);
    // The badges and the franchise are real, and the lifetime figure has them.
    const carriedXp = newlyMet.reduce((sum, id) => sum + BADGE_XP[ACHIEVEMENTS_BY_ID.get(id)!.tier], 0);
    expect(after.lifetime).toBe(before.lifetime + carriedXp + XP.franchise);
    const rows = await db.unlockedAchievement.findMany({ where: { userId } });
    expect(rows.every((r) => r.carried)).toBe(true);

    // Visiting again changes nothing.
    await boardFor(userId);
    expect((await computeXp(userId)).trekker).toBe(before.trekker);

    // Something watched here does.
    await recordPlay(userId, { ...film({ tmdbId: 777, title: "Tonight" }), watchedAt: new Date(Date.now() + 1000) });
    expect((await computeXp(userId)).trekker).toBe(before.trekker + XP.film);
  });

  it("pays for a badge the native play completes, since the history alone did not meet it", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...film({ tmdbId: 120, title: "Part 1" }), source: "trakt", watchedAt: new Date(2019, 2, 1, 20) });
    await recordPlay(userId, { ...film({ tmdbId: 121, title: "Part 2" }), source: "trakt", watchedAt: new Date(2019, 2, 2, 20) });
    for (const id of LOTR) await facts(id, "Adventure,Fantasy", { collectionId: 119, collectionName: "The Lord of the Rings Collection" });
    await collection(119, LOTR);
    await boardFor(userId);
    const before = await computeXp(userId);

    await recordPlay(userId, { ...film({ tmdbId: 122, title: "Part 3" }), watchedAt: new Date(Date.now() + 1000) });
    const board = await boardFor(userId);
    expect(board.fresh).toContain("franchise-lord-of-the-rings");
    const row = await db.unlockedAchievement.findUniqueOrThrow({
      where: { userId_key: { userId, key: "franchise-lord-of-the-rings" } },
    });
    expect(row.carried).toBe(false);

    const earned = board.fresh.reduce((sum, id) => sum + BADGE_XP[ACHIEVEMENTS_BY_ID.get(id)!.tier], 0);
    const carried = await db.unlockedAchievement.findMany({ where: { userId, key: { in: board.fresh }, carried: true } });
    const carriedXp = carried.reduce((sum, r) => sum + BADGE_XP[ACHIEVEMENTS_BY_ID.get(r.key)!.tier], 0);
    expect((await computeXp(userId)).trekker).toBe(before.trekker + XP.film + XP.franchise + earned - carriedXp);
  });
});

describe("a database brought over from the old app", () => {
  /**
   * The old app's shape: an imported history, the unlocks it wrote (added
   * with `carried` false by the column's default), its own completion counts
   * and a starting line drawn long ago, none of which knows what the history
   * alone completes. The facts are all known, so the evaluation finds more
   * than the old app did: a finished show, a complete franchise, and badges it
   * never wrote.
   */
  async function oldAccount() {
    const baseline = new Date("2026-08-06T18:00:00Z");
    const userId = (
      await db.user.update({
        where: { id: (await freshUser()).id },
        data: { levelBaselineAt: baseline, levelSyncedAt: baseline, levelFinishedShows: 0, levelBaseShows: 0, levelFinishedFranchises: 0, levelBaseFranchises: 0 },
      })
    ).id;
    for (const [i, tmdbId] of LOTR.entries()) {
      await recordPlay(userId, { ...film({ tmdbId, title: `Part ${i + 1}` }), source: "backfill", watchedAt: new Date(2019, 2, 1 + i, 20) });
    }
    await recordPlay(userId, { ...film({ tmdbId: 900, title: "Scary" }), source: "backfill", watchedAt: new Date(2020, 9, 31, 21) });
    for (let n = 1; n <= 3; n++) {
      await recordPlay(userId, { ...episode(1, n), source: "backfill", watchedAt: new Date(2018, 0, n, 21) });
    }
    await db.titleState.upsert({
      where: { userId_showId: { userId, showId: 1396 } },
      update: { status: "ended", airedCount: 3, watchedCount: 3, totalCount: 3 },
      create: { userId, showId: 1396, showName: "Breaking Bad", status: "ended", airedCount: 3, watchedCount: 3, totalCount: 3 },
    });
    for (const id of LOTR) await facts(id, "Adventure,Fantasy", { collectionId: 119, collectionName: "The Lord of the Rings Collection" });
    await facts(900, "Horror");
    await collection(119, LOTR);
    // What the old app wrote, before its line, with the new column's default.
    await db.unlockedAchievement.create({ data: { userId, key: "first-contact", unlockedAt: new Date("2026-08-05T17:52:11Z") } });
    // A little done here since, which does count.
    await recordPlay(userId, { ...film({ tmdbId: 777, title: "Since" }), source: "manual", watchedAt: new Date("2026-09-01T20:00:00Z") });
    return userId;
  }

  it("reads the same level before and after the first Badges visit once the start-up repair has run", async () => {
    const userId = await oldAccount();

    // What `prisma migrate deploy` and the next server start do.
    await db.$executeRawUnsafe(fs.readFileSync(path.resolve(import.meta.dirname, "../prisma/migrations/20260924200000_carry_imported_unlocks/migration.sql"), "utf8"));
    expect((await repairLevels()).users).toBeGreaterThan(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).levelRepairedAt).not.toBeNull();

    const before = await computeXp(userId);
    const board = await boardFor(userId);
    const after = await computeXp(userId);
    expect(after).toEqual(before);
    // The repair wrote what the evaluation finds, so the visit had nothing left to write.
    expect(board.fresh).toEqual([]);
    // Only the film watched here, and nothing the history did, is in the Trekker figure.
    expect(before.trekker).toBe(XP.film);

    // A second start leaves a repaired account alone.
    expect((await repairLevels()).users).toBe(0);
  });

  it("without the repair, the first visit is what moved it", async () => {
    const userId = await oldAccount();
    // The old rules' arithmetic on the old app's state: the old unlock pays.
    const stale = await computeXp(userId);
    expect(stale.trekker).toBe(XP.film + BADGE_XP.bronze);
    await db.$executeRawUnsafe(fs.readFileSync(path.resolve(import.meta.dirname, "../prisma/migrations/20260924200000_carry_imported_unlocks/migration.sql"), "utf8"));
    await boardFor(userId);
    expect((await computeXp(userId)).trekker).toBe(XP.film);
  });
});

describe("the carried-unlock repair", () => {
  const sql = fs.readFileSync(
    path.resolve(import.meta.dirname, "../prisma/migrations/20260924200000_carry_imported_unlocks/migration.sql"),
    "utf8",
  );

  it("carries what an imported account unlocked before its line, and leaves the rest", async () => {
    const baseline = new Date("2026-08-06T18:00:00Z");
    const imported = (await db.user.update({ where: { id: (await freshUser()).id }, data: { levelBaselineAt: baseline } })).id;
    await recordPlay(imported, { ...film(), source: "backfill", watchedAt: new Date("2020-01-05T20:00:00Z") });
    await db.unlockedAchievement.createMany({
      data: [
        { userId: imported, key: "first-contact", unlockedAt: new Date("2026-08-05T17:52:11Z") },
        { userId: imported, key: "double-feature", unlockedAt: new Date("2026-09-01T20:00:00Z") },
      ],
    });

    // No line yet: the first play logged here stands in for it.
    const unset = (await freshUser()).id;
    await recordPlay(unset, { ...film(), source: "trakt", watchedAt: new Date("2020-01-05T20:00:00Z") });
    await recordPlay(unset, { ...film({ tmdbId: 551 }), watchedAt: new Date("2026-08-10T20:00:00Z") });
    await db.unlockedAchievement.createMany({
      data: [
        { userId: unset, key: "first-contact", unlockedAt: new Date("2026-08-01T00:00:00Z") },
        { userId: unset, key: "night-owl", unlockedAt: new Date("2026-08-11T00:00:00Z") },
      ],
    });

    // Nothing imported: everything was earned here, even a moment before the line.
    const native = (await db.user.update({ where: { id: (await freshUser()).id }, data: { levelBaselineAt: baseline } })).id;
    await recordPlay(native, { ...film(), watchedAt: new Date("2026-08-01T20:00:00Z") });
    await db.unlockedAchievement.create({ data: { userId: native, key: "first-contact", unlockedAt: new Date("2026-08-06T17:59:59Z") } });

    await db.$executeRawUnsafe(sql);

    const carried = async (userId: string) =>
      Object.fromEntries((await db.unlockedAchievement.findMany({ where: { userId } })).map((r) => [r.key, r.carried]));
    expect(await carried(imported)).toEqual({ "first-contact": true, "double-feature": false });
    expect(await carried(unset)).toEqual({ "first-contact": true, "night-owl": false });
    expect(await carried(native)).toEqual({ "first-contact": false });
  });
});
