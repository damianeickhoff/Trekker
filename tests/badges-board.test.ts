import { describe, expect, it } from "vitest";
import { boardFor, toGoLabel } from "@/lib/achievements";
import { closestToEarning, matches, showCounts, type Filterable, type Filters } from "@/lib/achievements/filter";
import { computeXp } from "@/lib/achievements/xp";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { film, freshUser } from "./helpers/db";

/**
 * The badges page's narrowing, now done on the client so a tap on a group
 * answers at once, and the XP breakdown beside the level.
 */

const b = (over: Partial<Filterable>): Filterable => ({
  name: "Badge",
  description: "Does a thing.",
  group: "Milestones",
  tier: "bronze",
  earned: false,
  percent: 0,
  ...over,
});

const none: Filters = { group: null, show: "all", tier: null, query: "" };

describe("filtering the board", () => {
  const board = [
    b({ name: "First Contact", earned: true, percent: 100 }),
    b({ name: "Season of the Witch", description: "Horror in October.", group: "Seasons", tier: "gold", percent: 40 }),
    b({ name: "The Infinity Saga", group: "Completion", tier: "legend", percent: 91 }),
    b({ name: "Night Owl", group: "Habits", tier: "silver", earned: true, percent: 100 }),
  ];
  const names = (f: Partial<Filters>) => board.filter((x) => matches(x, { ...none, ...f })).map((x) => x.name);

  it("narrows by group, state and tier, together", () => {
    expect(names({ group: "Seasons" })).toEqual(["Season of the Witch"]);
    expect(names({ show: "done" })).toEqual(["First Contact", "Night Owl"]);
    expect(names({ show: "todo" })).toEqual(["Season of the Witch", "The Infinity Saga"]);
    expect(names({ tier: "legend" })).toEqual(["The Infinity Saga"]);
    expect(names({ show: "done", tier: "legend" })).toEqual([]);
  });

  it("searches the name, the description and the group, ignoring case and spaces round it", () => {
    expect(names({ query: "  OCTOBER " })).toEqual(["Season of the Witch"]);
    expect(names({ query: "habits" })).toEqual(["Night Owl"]);
    expect(names({ query: "saga" })).toEqual(["The Infinity Saga"]);
  });

  it("counts All, In progress and Earned over the whole board", () => {
    expect(showCounts(board)).toEqual({ all: 4, todo: 2, done: 2 });
  });
});

describe("closest to earning", () => {
  it("is the three unearned badges furthest along, never one not started", () => {
    const board = [
      b({ name: "A", percent: 10 }),
      b({ name: "B", percent: 90 }),
      b({ name: "C", percent: 0 }),
      b({ name: "D", earned: true, percent: 100 }),
      b({ name: "E", percent: 50 }),
      b({ name: "F", percent: 50 }),
    ];
    expect(closestToEarning(board).map((x) => x.name)).toEqual(["B", "E", "F"]);
    expect(closestToEarning([b({ percent: 0 })])).toEqual([]);
  });

  it("says what is left in the badge's own unit", () => {
    expect(toGoLabel(3)).toBe("3 to go");
    expect(toGoLabel(1250)).toBe("1,250 to go");
    expect(toGoLabel(61, "minutes")).toBe("2h to go");
    expect(toGoLabel(0)).toBe("1 to go");
  });

  it("comes from the board with a count to go on a badge part-way", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...film(), watchedAt: new Date(2026, 4, 10, 20) });
    const board = await boardFor(userId);
    const earned = board.badges.find((x) => x.id === "first-contact")!;
    expect(earned.toGo).toBeNull();
    const partway = board.badges.find((x) => !x.earned && x.percent > 0 && x.toGo);
    expect(partway?.toGo).toMatch(/ to go$/);
  });
});

describe("the XP breakdown", () => {
  it("adds up to the Trekker figure, row by row", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...film(), watchedAt: new Date(2026, 4, 10, 20) });
    await recordPlay(userId, { ...film({ tmdbId: 551, title: "Imported" }), source: "backfill", watchedAt: new Date(2020, 0, 5, 20) });
    await db.rating.create({ data: { userId, mediaType: "movie", tmdbId: 550, title: "Fight Club", score: 4, review: "Good." } });
    await boardFor(userId);

    const { trekker, sources } = await computeXp(userId);
    expect(sources.reduce((sum, s) => sum + s.xp, 0)).toBe(trekker);
    expect(sources.find((s) => s.key === "films")).toMatchObject({ count: 1, rate: 45, xp: 45 });
    expect(sources.find((s) => s.key === "reviews")).toMatchObject({ count: 1 });
  });
});
