import { describe, expect, it } from "vitest";
import { dayLayout } from "@/components/calendar/day-layout";
import { landingWhen, localMidday, resolveWeek } from "@/lib/dates";
import { releaseDatesFor } from "@/lib/tmdb";

/** The calendar's `?w=` and the small date wordings Home and the calendar share. */

const TODAY = "2026-09-23"; // a Wednesday

describe("the week picker", () => {
  it("defaults to the week containing today, Monday to Sunday", () => {
    const week = resolveWeek(undefined, TODAY);
    expect(week).toMatchObject({
      start: "2026-09-21",
      end: "2026-09-27",
      previous: "2026-09-14",
      next: "2026-09-28",
      offset: 0,
      title: "This week",
      range: "21 – 27 September 2026",
    });
    expect(week.days).toHaveLength(7);
  });

  it("takes any day of a week to mean that week", () => {
    expect(resolveWeek("2026-10-01", TODAY)).toMatchObject({ start: "2026-09-28", title: "Next week", offset: 1 });
    expect(resolveWeek("2026-09-20", TODAY)).toMatchObject({ start: "2026-09-14", title: "Last week", offset: -1 });
    expect(resolveWeek("2026-10-18", TODAY)).toMatchObject({ start: "2026-10-12", title: "Week of 12 October", offset: 3 });
  });

  it("writes weeks that straddle a month or a year in full", () => {
    expect(resolveWeek("2026-10-01", TODAY).range).toBe("28 September – 4 October 2026");
    expect(resolveWeek("2026-12-31", TODAY).range).toBe("28 December 2026 – 3 January 2027");
  });

  it("falls back to this week for anything it cannot read", () => {
    for (const bad of ["", "next", "2026-13-01", "2026-02-30", "23-09-2026", ["2026-09-01", "x"]]) {
      const week = resolveWeek(bad as string, TODAY);
      expect(week.start).toBe(Array.isArray(bad) ? "2026-08-31" : "2026-09-21");
    }
  });
});

describe("date wording", () => {
  it("says when something lands the way people say it", () => {
    expect(landingWhen(TODAY, TODAY)).toBe("Today");
    expect(landingWhen("2026-09-24", TODAY)).toBe("Tomorrow");
    expect(landingWhen("2026-09-27", TODAY)).toBe("Sunday");
    expect(landingWhen("2026-10-02", TODAY)).toBe("in 9 days");
    expect(landingWhen("2026-10-14", TODAY)).toBe("in 3 weeks");
  });

  it("puts a chosen day at midday, local time", () => {
    const at = localMidday("2026-03-29");
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2026, 2, 29, 12, 0]);
  });
});

describe("film release dates", () => {
  const answer = {
    results: [
      {
        iso_3166_1: "GB",
        release_dates: [
          { type: 4, release_date: "2026-11-20T00:00:00.000Z" },
          { type: 3, release_date: "2026-10-02T00:00:00.000Z" },
          { type: 2, release_date: "2026-09-25T00:00:00.000Z" },
        ],
      },
      { iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-09-26T00:00:00.000Z" }] },
    ],
  };

  it("takes the region's wide cinema release and its digital one", () => {
    expect(releaseDatesFor(answer, "GB", "2026-09-26")).toEqual({ releaseDate: "2026-10-02", streamingDate: "2026-11-20" });
  });

  it("falls back to the primary date for cinemas, and never guesses streaming", () => {
    expect(releaseDatesFor(answer, "NL", "2026-09-26")).toEqual({ releaseDate: "2026-09-26", streamingDate: null });
    expect(releaseDatesFor(null, "GB", null)).toEqual({ releaseDate: null, streamingDate: null });
  });
});

describe("a desktop day column", () => {
  it("draws one arrival across the column up to 200px, two as 140px posters stacked, three or more as rows", () => {
    expect(dayLayout(1)).toMatchObject({ kind: "poster", width: 200, className: "w-full max-w-[200px]", posters: 1 });
    expect(dayLayout(2)).toMatchObject({ kind: "poster", width: 140, className: "w-[140px]", posters: 2 });
    for (const n of [3, 4, 9]) expect(dayLayout(n)).toEqual({ kind: "rows" });
  });

  it("keeps the watched tick legible on the smaller poster", () => {
    const small = dayLayout(2);
    expect(small.kind === "poster" && small.tick).toBeGreaterThanOrEqual(20);
  });
});
