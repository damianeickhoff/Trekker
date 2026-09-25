import { describe, expect, it } from "vitest";
import { measureMonth, monthlyChallenges } from "@/lib/challenges";
import {
  CHALLENGES,
  CHALLENGES_BY_ID,
  challengesFor,
  evaluate,
  type ChallengeWindow,
  type WindowPlay,
} from "@/lib/challenges/catalogue";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { episode, film, freshUser } from "./helpers/db";

/**
 * The monthly challenges: the trio is decided by the month alone, and
 * progress is a pure function of one month of plays.
 */

function play(day: number, overrides: Partial<WindowPlay> = {}): WindowPlay {
  return {
    mediaType: "tv",
    tmdbId: 1,
    seasonNumber: 1,
    episodeNumber: day,
    runtime: 45,
    watchedAt: new Date(2026, 8, day, 21, 0),
    ...overrides,
  };
}

function windowOf(plays: WindowPlay[]): ChallengeWindow {
  return { plays, facts: new Map(), ratings: [], showsBefore: new Set(), year: 2026 };
}

describe("the monthly trio", () => {
  it("is three different challenges, the same for everyone, and none carried over", () => {
    const september = challengesFor(new Date(2026, 8, 3));
    expect(september).toHaveLength(3);
    expect(new Set(september.map((c) => c.id)).size).toBe(3);
    expect(challengesFor(new Date(2026, 8, 29)).map((c) => c.id)).toEqual(september.map((c) => c.id));
    const october = challengesFor(new Date(2026, 9, 1)).map((c) => c.id);
    expect(october.some((id) => september.some((c) => c.id === id))).toBe(false);
  });

  it("walks the whole pool", () => {
    const seen = new Set<string>();
    for (let m = 0; m < CHALLENGES.length; m++) {
      for (const c of challengesFor(new Date(2026, m, 1))) seen.add(c.id);
    }
    expect(seen.size).toBe(CHALLENGES.length);
  });
});

describe("evaluation", () => {
  const marathon = CHALLENGES_BY_ID.get("marathon-month")!;
  const streak = CHALLENGES_BY_ID.get("seven-in-a-row")!;

  it("Marathon Month counts episodes, not films, and caps at the target", () => {
    const plays = [...Array.from({ length: 12 }, (_, i) => play(i + 1)), play(3, { mediaType: "movie", tmdbId: 9 })];
    expect(evaluate(windowOf(plays), [marathon])).toEqual([{ id: "marathon-month", progress: 12 }]);
    const lots = Array.from({ length: 25 }, (_, i) => play((i % 28) + 1, { episodeNumber: i }));
    expect(evaluate(windowOf(lots), [marathon])[0].progress).toBe(20);
  });

  it("Seven in a Row is the longest run of consecutive days, however many plays a day", () => {
    const days = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 20];
    const plays = days.flatMap((d) => [play(d), play(d, { episodeNumber: 99 })]);
    expect(evaluate(windowOf(plays), [streak])[0].progress).toBe(7);
    expect(evaluate(windowOf([play(1), play(3), play(5)]), [streak])[0].progress).toBe(1);
  });

  it("reads one month of plays from the log and writes a finished challenge down once", async () => {
    const userId = (await freshUser()).id;
    const now = new Date(2026, 8, 23, 12);
    // Last month does not count; this month does.
    await recordPlay(userId, { ...episode(1, 1), watchedAt: new Date(2026, 7, 30, 20) });
    for (let d = 1; d <= 3; d++) {
      await recordPlay(userId, { ...film({ tmdbId: 700 + d }), watchedAt: new Date(2026, 8, d, 20) });
    }
    const progress = await measureMonth(userId, now);
    expect(progress.map((p) => p.id)).toEqual(challengesFor(now).map((c) => c.id));

    // A finished challenge becomes a run, and only one however often it is looked at.
    const [first] = challengesFor(now);
    const done = [{ id: first.id, progress: first.target }, ...progress.slice(1)];
    const strip = await monthlyChallenges(userId, now, done);
    await monthlyChallenges(userId, now, done);
    expect(strip.cards[0]).toMatchObject({ done: true, percent: 100, xp: first.xp });
    expect(strip.open).toBe(strip.cards.filter((c) => !c.done).length);
    // The month is worth the three together, and only the finished one is earned so far.
    expect(strip.totalXp).toBe(challengesFor(now).reduce((sum, c) => sum + c.xp, 0));
    expect(strip.earnedXp).toBe(first.xp + strip.cards.slice(1).reduce((sum, c) => sum + (c.done ? c.xp : 0), 0));
    expect(await db.challengeRun.count({ where: { userId, period: "2026-09" } })).toBe(1);
  });
});

describe("the strip's icons", () => {
  it("gives every challenge an icon of its own kind, and no two in a month share one", () => {
    for (const c of CHALLENGES) expect(c.icon).toMatch(/^[a-zA-Z]+$/);
    for (let month = 0; month < 24; month++) {
      const trio = challengesFor(new Date(2026, month, 1)).map((c) => c.icon);
      expect(new Set(trio).size).toBe(trio.length);
    }
  });
});
