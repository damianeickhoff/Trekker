import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import {
  currentStreak,
  dayKey,
  genreSharesFrom,
  habitsFrom,
  heatmapFrom,
  historyPage,
  profileHabits,
  profileMostWatched,
  profileTotals,
  rankMostWatched,
  resolveRange,
  seriesFrom,
  weekdaysFrom,
} from "@/lib/profile";
import { episode, film, freshUser } from "./helpers/db";

/**
 * The profile's figures, ported from the old app: the range windows, how the
 * chart buckets them, the weekday and genre shares, the heatmap's day count,
 * the most-watched ranking and the eight habits, on a fixture small enough to
 * count by hand.
 */

// A Wednesday afternoon, local time, well clear of midnight and clock changes.
const NOW = new Date(2026, 8, 23, 15, 0);
const local = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h);

describe("the range", () => {
  it("draws calendar edges in local time", () => {
    expect(resolveRange("month", NOW)).toMatchObject({ from: new Date(2026, 8, 1), to: null, buckets: "day" });
    expect(resolveRange("year", NOW)).toMatchObject({ from: new Date(2026, 0, 1), to: null, buckets: "month" });
    expect(resolveRange("last-year", NOW)).toMatchObject({ from: new Date(2025, 0, 1), to: new Date(2026, 0, 1), buckets: "month" });
    expect(resolveRange("all", NOW)).toMatchObject({ from: null, to: null, buckets: "year" });
  });
});

describe("the series", () => {
  const plays = [
    { runtime: 60, watchedAt: local(2024, 3, 2) },
    { runtime: 120, watchedAt: local(2025, 12, 31) },
    { runtime: 30, watchedAt: local(2026, 1, 5) },
    { runtime: 45, watchedAt: local(2026, 9, 23, 9) },
  ];
  const span = { first: plays[0].watchedAt, last: plays[3].watchedAt };

  it("buckets all time by year, oldest to this one, zeroes kept", () => {
    const s = seriesFrom(plays, resolveRange("all", NOW), span, NOW);
    expect(s.unit).toBe("year");
    expect(s.points.map((p) => [p.label, p.minutes])).toEqual([["2024", 60], ["2025", 120], ["2026", 75]]);
    expect(s.live).toBe(true);
  });

  it("buckets this year by month and stops at the present one", () => {
    const s = seriesFrom(plays, resolveRange("year", NOW), span, NOW);
    expect(s.unit).toBe("month");
    expect(s.points).toHaveLength(9);
    expect(s.points[0]).toMatchObject({ label: "Jan", minutes: 30 });
    expect(s.points[8]).toMatchObject({ label: "Sep", minutes: 45 });
  });

  it("gives last year all twelve months and no live point", () => {
    const s = seriesFrom(plays, resolveRange("last-year", NOW), span, NOW);
    expect(s.points).toHaveLength(12);
    expect(s.points[11].minutes).toBe(120);
    expect(s.live).toBe(false);
  });

  it("buckets this month by day up to today", () => {
    const s = seriesFrom(plays, resolveRange("month", NOW), span, NOW);
    expect(s.unit).toBe("day");
    expect(s.points).toHaveLength(23);
    expect(s.points[22].minutes).toBe(45);
  });
});

describe("weekdays and genres", () => {
  it("counts minutes per weekday, Monday first, and the top day's share", () => {
    // 21 Sep 2026 is a Monday, 25th a Friday.
    const w = weekdaysFrom([
      { runtime: 30, watchedAt: local(2026, 9, 21) },
      { runtime: 60, watchedAt: local(2026, 9, 25) },
      { runtime: 10, watchedAt: local(2026, 9, 25) },
    ]);
    expect(w.days.map((d) => d.minutes)).toEqual([30, 0, 0, 0, 70, 0, 0]);
    expect(w.top).toBe(4);
    expect(w.share).toBe(70);
    expect(weekdaysFrom([]).top).toBeNull();
  });

  it("shares the top five genres among themselves, one vote per title", () => {
    const g = genreSharesFrom([
      ["Drama", "Crime", "Drama"],
      ["Drama"],
      ["Comedy"],
      ["Horror"],
      ["Mystery"],
      ["Western"],
    ]);
    expect(g).toHaveLength(5);
    expect(g[0]).toEqual({ name: "Drama", share: 33 });
    expect(g.reduce((s, x) => s + x.share, 0)).toBeGreaterThanOrEqual(98);
  });
});

describe("the heatmap", () => {
  it("counts days watched in the last six months, not viewings, and ends at today", () => {
    const h = heatmapFrom(
      [
        { runtime: 40, watchedAt: local(2026, 9, 23, 9) },
        { runtime: 40, watchedAt: local(2026, 9, 23, 10) },
        { runtime: 10, watchedAt: local(2026, 4, 2) },
        { runtime: 30, watchedAt: local(2026, 3, 20) },
        { runtime: 90, watchedAt: local(2020, 1, 2) },
      ],
      NOW,
    );
    expect(h.daysWatched).toBe(2);
    expect(h.peak).toBe(80);
    const last = h.weeks.at(-1)!;
    expect(last.at(-1)!.date).toBe(dayKey(NOW));
    // Twenty-six columns exactly, the first a whole week from its Monday.
    expect(h.weeks).toHaveLength(26);
    expect(h.weeks[0][0].date).toBe("2026-03-30");
    expect(h.weeks.every((w, i) => i === h.weeks.length - 1 || w.length === 7)).toBe(true);
    expect(h.weeks.flat().find((c) => c.date === "2026-09-23")!.level).toBe(4);
  });

  it("keeps a streak alive until a whole day has passed", () => {
    expect(currentStreak(["2026-09-20", "2026-09-21", "2026-09-22"], NOW)).toBe(3);
    expect(currentStreak(["2026-09-20", "2026-09-21"], NOW)).toBe(0);
  });
});

describe("most watched", () => {
  it("ranks by viewings, minutes breaking a tie", () => {
    const ranked = rankMostWatched([
      { id: "a", plays: 3, minutes: 100 },
      { id: "b", plays: 5, minutes: 10 },
      { id: "c", plays: 3, minutes: 300 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("on a fixture", () => {
  let userId: string;

  beforeEach(async () => {
    userId = (await freshUser()).id;
    // Four episodes of one show on one day, one of another the next, and a
    // film twice: the show wins on episodes, the film is two viewings.
    for (let n = 1; n <= 4; n++) await recordPlay(userId, { ...episode(1, n), watchedAt: local(2026, 9, 21, 18 + n) });
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 60059, title: "Better Call Saul", runtime: 50 }), watchedAt: local(2026, 9, 22) });
    await recordPlay(userId, { ...film(), watchedAt: local(2025, 5, 1) });
    await recordPlay(userId, { ...film(), watchedAt: local(2026, 9, 22, 22) });
    await recordPlay(userId, { ...film({ tmdbId: 9552, title: "The Exorcist", runtime: 122 }), watchedAt: local(2026, 2, 1) });
    await db.titleMeta.createMany({
      data: [
        { mediaType: "movie", tmdbId: 550, title: "Fight Club", genres: "Drama", releaseDate: "1999-10-15" },
        { mediaType: "movie", tmdbId: 9552, title: "The Exorcist", genres: "Horror", releaseDate: "1973-12-26" },
      ],
    });
  });

  it("orders most watched and says episodes for a show", async () => {
    const rows = await profileMostWatched(userId, "all");
    expect(rows.map((r) => [r.title, r.plays])).toEqual([
      ["Breaking Bad", 4],
      ["Fight Club", 2],
      // A tie on viewings goes to the longer: 122 minutes against 50.
      ["The Exorcist", 1],
      ["Better Call Saul", 1],
    ]);
    expect(rows[0].minutes).toBe(4 * 47);
  });

  it("follows the range in the totals", async () => {
    const all = await profileTotals(userId, "all");
    expect(all).toMatchObject({ episodes: 5, filmViewings: 3, distinctFilms: 2, distinctShows: 2, longestStreak: 2 });
    const last = await profileTotals(userId, "last-year");
    expect(last).toMatchObject({ episodes: 0, filmViewings: 1, currentStreak: null });
  });

  it("works out the eight habits", async () => {
    const habits = await profileHabits(userId, "all");
    expect(habits.map((h) => h.label)).toEqual([
      "Biggest session",
      "Longest streak",
      "Most watched show",
      "Most watched actor",
      "Top franchise",
      "Oldest film",
      "Average episode",
      "Episodes you rated",
    ]);
    const by = Object.fromEntries(habits.map((h) => [h.key, h]));
    expect(by.session).toMatchObject({ value: "3h 9m", sub: "22 September 2026" });
    expect(by.streak.value).toBe("2 days");
    expect(by.show).toMatchObject({ value: "Breaking Bad", sub: "4 episodes" });
    expect(by.actor.value).toBe("None yet");
    expect(by.oldest).toMatchObject({ value: "The Exorcist", sub: "released in 1973" });
    expect(by.episode).toMatchObject({ value: "48 min", sub: "1 binge day (4+ episodes)" });
    expect(by.verdicts.value).toBe("0 liked");
  });

  it("pages the history by viewings, grouped into local days", async () => {
    const page = await historyPage(userId, 1);
    expect(page.total).toBe(8);
    expect(page.more).toBe(false);
    expect(page.days[0].key).toBe("2026-09-22");
    expect(page.days[0].rows).toHaveLength(2);
  });
});

describe("habits with nothing to go on", () => {
  it("keeps all eight tiles with quiet answers", () => {
    const habits = habitsFrom({ plays: [], films: [], actor: null, verdicts: { liked: 0, disliked: 0 } });
    expect(habits).toHaveLength(8);
    expect(habits[0].value).toBe("None yet");
  });

  it("does not take an import landing on one day for a sitting", () => {
    const imported = Array.from({ length: 40 }, () => ({ mediaType: "tv", tmdbId: 1, title: "Imported", runtime: 45, watchedAt: local(2018, 9, 21) }));
    const evening = { mediaType: "movie", tmdbId: 2, title: "Film", runtime: 150, watchedAt: local(2026, 9, 1) };
    const [session] = habitsFrom({ plays: [...imported, evening], films: [], actor: null, verdicts: { liked: 0, disliked: 0 } });
    expect(session).toMatchObject({ value: "2h 30m", sub: "1 September 2026" });
  });
});
