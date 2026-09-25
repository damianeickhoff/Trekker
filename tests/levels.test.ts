import { describe, expect, it } from "vitest";
import { levelFromXp, MAX_LEVEL, nextRank, rankFor, toNextLabel, xpForLevel } from "@/lib/levels";

/** The curve and the ranks, carried over from the current app unchanged. */
describe("the level from XP", () => {
  it("follows 400 × n^1.7, from level 0", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(400);
    expect(xpForLevel(10)).toBe(20047);
    expect(xpForLevel(25)).toBe(Math.round(400 * Math.pow(25, 1.7)));
  });

  it("reaches a level exactly at its threshold, not a point before", () => {
    expect(levelFromXp(0).level).toBe(0);
    expect(levelFromXp(399).level).toBe(0);
    expect(levelFromXp(400).level).toBe(1);
    expect(levelFromXp(20046).level).toBe(9);
    expect(levelFromXp(20047).level).toBe(10);
  });

  it("says how far through the level and how much is left", () => {
    const p = levelFromXp(400 + (xpForLevel(2) - 400) / 2);
    expect(p.level).toBe(1);
    expect(p.floor).toBe(400);
    expect(p.ceiling).toBe(xpForLevel(2));
    expect(p.percent).toBe(50);
    expect(p.toNextLevel).toBe(xpForLevel(2) - p.xp);
    expect(toNextLabel(p)).toBe(`${p.toNextLevel.toLocaleString("en-GB")} XP to 2`);
  });

  it("stops at the cap, full, with nothing left to earn", () => {
    const p = levelFromXp(xpForLevel(MAX_LEVEL) * 3);
    expect(p).toMatchObject({ level: MAX_LEVEL, maxed: true, percent: 100, toNextLevel: 0, rank: "Legendary" });
    expect(toNextLabel(p)).toBe("Top level");
  });

  it("treats negative or fractional XP as whole and never below zero", () => {
    expect(levelFromXp(-50)).toMatchObject({ level: 0, xp: 0 });
    expect(levelFromXp(399.6).level).toBe(1);
  });

  it("changes rank every five levels", () => {
    expect([0, 4, 5, 9, 10, 44, 45, 49, 50].map(rankFor)).toEqual([
      "Rookie", "Rookie", "Novice", "Novice", "Regular", "Master", "Grandmaster", "Grandmaster", "Legendary",
    ]);
    expect(nextRank(3)).toEqual({ title: "Novice", level: 5 });
    expect(nextRank(50)).toBeNull();
  });
});
