import { describe, expect, it } from "vitest";
import { boardFor, cabinetFor, syncUnlocks } from "@/lib/achievements";
import { ACHIEVEMENTS, CORE_COUNT, GROUPS } from "@/lib/achievements/catalogue";
import { BEST_PICTURE_COUNT } from "@/lib/achievements/best-picture";
import { FRANCHISES } from "@/lib/achievements/franchises";
import { getLevel } from "@/lib/achievements/xp";
import { db } from "@/lib/db";
import { BADGE_XP, XP } from "@/lib/levels";
import { recordPlay, removePlay } from "@/lib/plays";
import { film, freshUser } from "./helpers/db";

/**
 * The badges end to end on a fixture: plays through `recordPlay`, title facts
 * in `TitleMeta` as the badges page would have gathered them, and the board
 * measured and written by `boardFor`. No network: TMDB has no key here.
 */

async function facts(tmdbId: number, genres: string, extra: Record<string, unknown> = {}) {
  await db.titleMeta.create({
    data: { mediaType: "movie", tmdbId, title: `Film ${tmdbId}`, genres, releaseDate: "2001-12-19", ...extra },
  });
}

const badge = (board: Awaited<ReturnType<typeof boardFor>>, id: string) => board.badges.find((b) => b.id === id)!;

describe("the catalogue", () => {
  it("has the thirty-seven in six groups, a badge per franchise, and the full Best Picture list", () => {
    expect(CORE_COUNT).toBe(37);
    expect(FRANCHISES).toHaveLength(25);
    expect(ACHIEVEMENTS).toHaveLength(62);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(62);
    expect(GROUPS).toEqual(["Milestones", "Habits", "Seasons", "Taste", "Completion", "People"]);
    expect(new Set(ACHIEVEMENTS.map((a) => a.group))).toEqual(new Set(GROUPS));
    expect(BEST_PICTURE_COUNT).toBe(97);
  });
});

describe("earning badges", () => {
  it("a milestone: First Contact on the first viewing, written once, with its XP", async () => {
    const userId = (await freshUser()).id;
    const before = await boardFor(userId);
    expect(badge(before, "first-contact")).toMatchObject({ earned: false, percent: 0, sub: "Not yet" });

    await recordPlay(userId, { ...film(), watchedAt: new Date(2026, 4, 10, 20) });
    const after = await boardFor(userId);
    expect(after.fresh).toContain("first-contact");
    expect(badge(after, "first-contact")).toMatchObject({ earned: true, percent: 100 });
    expect(badge(after, "first-contact").sub).toMatch(/^Earned /);

    // Measured again, nothing is new and nothing is written twice.
    const again = await boardFor(userId);
    expect(again.fresh).toEqual([]);
    expect(await db.unlockedAchievement.count({ where: { userId, key: "first-contact" } })).toBe(1);

    // Nothing imported, so the badge pays: a film and a bronze badge.
    const level = await getLevel(userId);
    expect(level.xp).toBe(XP.film + BADGE_XP.bronze + extraBadgeXp(after.fresh));
  });

  it("a franchise: the Lord of the Rings once all three are seen, by their shared collection", async () => {
    const userId = (await freshUser()).id;
    for (const id of [120, 121, 122]) await facts(id, "Adventure,Fantasy", { collectionId: 119, collectionName: "The Lord of the Rings Collection" });

    await recordPlay(userId, { ...film({ tmdbId: 120, title: "Fellowship" }), watchedAt: new Date(2026, 4, 1, 20) });
    await recordPlay(userId, { ...film({ tmdbId: 121, title: "Two Towers" }), watchedAt: new Date(2026, 4, 2, 20) });
    const partway = await boardFor(userId);
    expect(badge(partway, "franchise-lord-of-the-rings")).toMatchObject({ earned: false, percent: 66 });
    expect(badge(partway, "franchise-lord-of-the-rings").sub).toBe("The Lord of the Rings · 2 of 3");

    await recordPlay(userId, { ...film({ tmdbId: 122, title: "Return of the King" }), watchedAt: new Date(2026, 4, 3, 20) });
    const done = await boardFor(userId);
    expect(done.fresh).toContain("franchise-lord-of-the-rings");
    expect(badge(done, "franchise-lord-of-the-rings").earned).toBe(true);
  });

  it("a seasonal one: a horror film on the 31st of October, and only then", async () => {
    const userId = (await freshUser()).id;
    await facts(900, "Horror,Thriller");
    await facts(901, "Comedy");
    await facts(902, "Horror");

    // The wrong genre on the right night, and the right genre the night before.
    await recordPlay(userId, { ...film({ tmdbId: 901, title: "Comedy" }), watchedAt: new Date(2025, 9, 31, 21) });
    await recordPlay(userId, { ...film({ tmdbId: 900, title: "Horror" }), watchedAt: new Date(2025, 9, 30, 21) });
    const september = new Date(2026, 8, 23, 12);
    const closed = await boardFor(userId, september);
    expect(badge(closed, "all-hallows-eve")).toMatchObject({ earned: false, sub: "Opens 31 October" });

    await recordPlay(userId, { ...film({ tmdbId: 902, title: "More horror" }), watchedAt: new Date(2025, 9, 31, 22) });
    const earned = await boardFor(userId, september);
    expect(earned.fresh).toContain("all-hallows-eve");
  });

  it("keeps a badge when the count behind it falls", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...film(), watchedAt: new Date(2026, 4, 10, 20) });
    await recordPlay(userId, { ...film({ tmdbId: 551, title: "Second" }), watchedAt: new Date(2026, 4, 10, 23) });
    expect(badge(await boardFor(userId), "double-feature").earned).toBe(true);

    await removePlay(userId, { mediaType: "movie", tmdbId: 551 }, "all");
    const board = await boardFor(userId);
    expect(badge(board, "double-feature")).toMatchObject({ earned: true, percent: 100 });
    expect((await cabinetFor(userId)).map((b) => b.id)).toContain("double-feature");
  });

  it("the check after a viewing unlocks from rows alone", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...film(), watchedAt: new Date(2026, 4, 10, 3) });
    const fresh = await syncUnlocks(userId);
    expect(fresh).toEqual(expect.arrayContaining(["first-contact", "night-owl"]));
    expect(await syncUnlocks(userId)).toEqual([]);
  });

  it("marks a badge an imported history met on sight as carried, and pays nothing for it", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...film(), source: "backfill", watchedAt: new Date(2020, 0, 5, 20) });
    await boardFor(userId);
    const row = await db.unlockedAchievement.findUniqueOrThrow({ where: { userId_key: { userId, key: "first-contact" } } });
    expect(row.carried).toBe(true);
    const level = await getLevel(userId);
    expect(level.xp).toBe(0);
    expect(level.lifetime.xp).toBe(XP.film + BADGE_XP.bronze);
  });
});

/** Anything else the one film earned on the same pass (none today, but the catalogue may grow). */
function extraBadgeXp(fresh: string[]) {
  return fresh
    .filter((id) => id !== "first-contact")
    .reduce((sum, id) => sum + BADGE_XP[ACHIEVEMENTS.find((a) => a.id === id)!.tier], 0);
}
