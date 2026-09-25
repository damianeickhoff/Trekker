import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { getReview, resolveMonth, reviewFrom, reviewWindow, selectableMonths } from "@/lib/review";
import { episode, film, freshUser } from "./helpers/db";

/**
 * The year review's figures, ported from the old app's `review.ts`: which
 * months can be recapped, the streak, the busiest day, the buckets, the show
 * of the year and the films, once each, on a fixture small enough to count by
 * hand.
 */

// A Wednesday afternoon in September, local time, clear of midnight.
const NOW = new Date(2026, 8, 23, 15, 0);
const local = (m: number, d: number, h = 20) => new Date(2026, m - 1, d, h);

const play = (over: Partial<{ mediaType: string; tmdbId: number; title: string; runtime: number; watchedAt: Date }>) => ({
  mediaType: "tv",
  tmdbId: 1,
  title: "Show",
  poster: null,
  runtime: 45,
  watchedAt: local(3, 1),
  ...over,
});

describe("the months", () => {
  it("offers January up to the month just gone, never the one in progress", () => {
    expect(selectableMonths(NOW)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(resolveMonth("2026-09", NOW)).toBe("2026-08");
    expect(resolveMonth("2026-03", NOW)).toBe("2026-03");
    expect(resolveMonth("nonsense", NOW)).toBe("2026-08");
  });

  it("has nothing to offer in January", () => {
    const january = new Date(2026, 0, 20);
    expect(selectableMonths(january)).toEqual([]);
    expect(resolveMonth(undefined, january)).toBeNull();
    expect(reviewWindow("month", null, january)).toBeNull();
  });

  it("draws the windows on calendar edges", () => {
    expect(reviewWindow("year", null, NOW)).toEqual({ from: new Date(2026, 0, 1), to: new Date(2027, 0, 1), label: "2026" });
    expect(reviewWindow("month", "2026-02", NOW)).toEqual({ from: new Date(2026, 1, 1), to: new Date(2026, 2, 1), label: "February 2026" });
  });
});

describe("the fold", () => {
  const year = reviewWindow("year", null, NOW)!;

  it("finds the longest run of days and the busiest day, the earliest winning a tie", () => {
    const r = reviewFrom(
      [
        play({ watchedAt: local(3, 1) }),
        play({ watchedAt: local(3, 2) }),
        play({ watchedAt: local(3, 2, 21) }),
        play({ watchedAt: local(3, 3) }),
        // A gap, then two more running days.
        play({ watchedAt: local(3, 10) }),
        play({ watchedAt: local(3, 11) }),
        play({ watchedAt: local(3, 11, 21) }),
      ],
      "year",
      year,
    );
    expect(r.streak).toBe(3);
    expect(r.busiestDay).toMatchObject({ key: "2026-03-02", count: 2 });
  });

  it("buckets a year by month and names the biggest stretch", () => {
    const r = reviewFrom(
      [
        play({ runtime: 60, watchedAt: local(1, 5) }),
        play({ runtime: 120, watchedAt: local(3, 5) }),
        play({ runtime: 30, watchedAt: local(3, 6) }),
      ],
      "year",
      year,
    );
    expect(r.buckets).toHaveLength(12);
    expect(r.buckets.map((b) => b.label).join("")).toBe("JFMAMJJASOND");
    expect(r.buckets[2].minutes).toBe(150);
    expect(r.peak).toMatchObject({ long: "March", minutes: 150 });
    expect(r.totalMinutes).toBe(210);
  });

  it("buckets a month by day, every day of it", () => {
    const feb = reviewWindow("month", "2026-02", NOW)!;
    const r = reviewFrom([play({ runtime: 50, watchedAt: new Date(2026, 1, 28, 22) })], "month", feb);
    expect(r.buckets).toHaveLength(28);
    expect(r.peak).toMatchObject({ label: "28", long: "28 February", minutes: 50 });
  });

  it("leaves out what falls outside the window", () => {
    const aug = reviewWindow("month", "2026-08", NOW)!;
    const r = reviewFrom([play({ watchedAt: local(8, 31, 23) }), play({ watchedAt: local(9, 1, 1) })], "month", aug);
    expect(r.episodeCount).toBe(1);
  });

  it("has no peak when nothing was watched", () => {
    const r = reviewFrom([], "year", year);
    expect(r.peak).toBeNull();
    expect(r.busiestDay).toBeNull();
    expect(r.streak).toBe(0);
  });

  it("ranks shows by minutes and lists each film once, newest first", () => {
    const r = reviewFrom(
      [
        play({ tmdbId: 1, title: "Short", runtime: 20, watchedAt: local(2, 1) }),
        play({ tmdbId: 2, title: "Long", runtime: 60, watchedAt: local(2, 2) }),
        play({ mediaType: "movie", tmdbId: 10, title: "Favourite", runtime: 100, watchedAt: local(2, 3) }),
        play({ mediaType: "movie", tmdbId: 11, title: "Other", runtime: 100, watchedAt: local(2, 4) }),
        play({ mediaType: "movie", tmdbId: 10, title: "Favourite", runtime: 100, watchedAt: local(2, 5) }),
      ],
      "year",
      year,
    );
    expect(r.topShows.map((s) => s.title)).toEqual(["Long", "Short"]);
    expect(r.films.map((f) => f.title)).toEqual(["Favourite", "Other"]);
    // Viewings still count every evening spent.
    expect(r.filmCount).toBe(3);
    expect(r.showCount).toBe(2);
  });
});

describe("the read", () => {
  it("dedupes repeat films, keeps the month in progress out of a month, and brings the bucket and year", async () => {
    const user = await freshUser();
    await recordPlay(user.id, film({ tmdbId: 550, watchedAt: local(8, 2) }));
    await recordPlay(user.id, film({ tmdbId: 550, watchedAt: local(8, 20) }));
    await recordPlay(user.id, film({ tmdbId: 603, title: "The Matrix", watchedAt: local(8, 10) }));
    await recordPlay(user.id, episode(1, 1, { watchedAt: local(9, 2) }));
    await db.rating.create({ data: { userId: user.id, mediaType: "movie", tmdbId: 550, title: "Fight Club", score: 5 } });
    await db.titleMeta.create({ data: { mediaType: "movie", tmdbId: 603, title: "The Matrix", genres: "Action", releaseDate: "1999-03-31" } });

    // Asking for September, still under way, lands on August.
    const month = resolveMonth("2026-09", NOW);
    const r = (await getReview(user.id, "month", month, NOW))!;
    expect(r.label).toBe("August 2026");
    expect(r.episodeCount).toBe(0);
    expect(r.filmCount).toBe(3);
    expect(r.films).toEqual([
      expect.objectContaining({ tmdbId: 550, score: 5, year: null }),
      expect.objectContaining({ tmdbId: 603, score: null, year: "1999" }),
    ]);

    const year = (await getReview(user.id, "year", null, NOW))!;
    expect(year.episodeCount).toBe(1);
    expect(year.showCount).toBe(1);
  });
});
