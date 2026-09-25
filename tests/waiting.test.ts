import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayKey } from "@/lib/dates";
import { recordPlay } from "@/lib/plays";
import { getUpNext } from "@/lib/title-state";
import { db } from "@/lib/db";
import type { UpNextRow } from "@/lib/title-state";
import { BACKLOG_ROWS, backlogRows, getBacklog, getWaiting, parseWaitingSort, sortWaiting } from "@/lib/waiting";
import { at, episode, freshUser, hours, seedEpisodes } from "./helpers/db";

/**
 * `/waiting`, "Still to watch": the four orders, each falling back to Home's
 * for ties, and the time the whole list would take.
 */

const today = todayKey();
let userId: string;

const ids = async (sort: Parameters<typeof sortWaiting>[1]) =>
  (await getWaiting(userId, sort, today)).rows.map((r) => r.showId);

beforeEach(async () => {
  userId = (await freshUser()).id;
  // Zeta: 4 aired, one seen, latest out 39 days ago, watched most recently.
  await seedEpisodes(100, [{ season: 1, count: 4, airedFrom: addDays(today, -60) }]);
  // alpha: 2 aired, one seen, latest out 13 days ago. Lower case, to show A–Z ignores case.
  await seedEpisodes(200, [{ season: 1, count: 2, airedFrom: addDays(today, -20) }]);
  // Beta: 6 aired, one seen, latest out 65 days ago, watched longest ago.
  await seedEpisodes(300, [{ season: 1, count: 6, airedFrom: addDays(today, -100) }]);
  await recordPlay(userId, { ...episode(1, 1, { tmdbId: 300, title: "Beta" }), watchedAt: at(hours(1)) });
  await recordPlay(userId, { ...episode(1, 1, { tmdbId: 200, title: "alpha" }), watchedAt: at(hours(2)) });
  await recordPlay(userId, { ...episode(1, 1, { tmdbId: 100, title: "Zeta" }), watchedAt: at(hours(3)) });
});

describe("Still to watch", () => {
  it("defaults to Home's own order, warmest first", async () => {
    expect(parseWaitingSort(undefined)).toBe("next");
    expect(parseWaitingSort("nonsense")).toBe("next");
    expect(await ids("next")).toEqual((await getUpNext(userId, Infinity, today)).map((r) => r.showId));
    expect(await ids("next")).toEqual([100, 200, 300]);
  });

  it("sorts A to Z by name, ignoring case", async () => {
    expect(await ids("az")).toEqual([200, 300, 100]);
  });

  it("puts the most episodes left first", async () => {
    expect(await ids("left")).toEqual([300, 100, 200]);
  });

  it("puts the show whose latest episode aired most recently first", async () => {
    expect(await ids("aired")).toEqual([200, 100, 300]);
  });

  it("keeps Home's order for ties", async () => {
    const rows = await getUpNext(userId, Infinity, today);
    const level = rows.map((r) => ({ ...r, airedCount: 5, watchedCount: 1, lastAirDate: "2026-01-01" }));
    expect(sortWaiting(level, "left").map((r) => r.showId)).toEqual([100, 200, 300]);
    expect(sortWaiting(level, "aired").map((r) => r.showId)).toEqual([100, 200, 300]);
  });

  it("adds up every aired, unseen episode for the time left", async () => {
    // 3 + 1 + 5 episodes at the seeded 45 minutes each.
    expect((await getWaiting(userId, "next", today)).minutes).toBe(9 * 45);
  });
});

describe("the calendar's backlog", () => {
  const row = (showId: number, lastAirDate: string | null, airDate: string | null = null): UpNextRow => ({
    showId,
    showName: `Show ${showId}`,
    showPoster: null,
    backdrop: null,
    seasonNumber: 1,
    episodeNumber: 1,
    episodeName: null,
    airDate,
    runtime: null,
    still: null,
    watchedCount: 0,
    airedCount: 1,
    totalCount: 1,
    lastAirDate,
  });
  const order = (rows: UpNextRow[]) => rows.map((r) => r.showId);

  it("sorts by the latest episode aired, newest first, with no grouping", () => {
    const rows = [
      row(1, "2026-09-13"),
      row(2, "2026-09-21"),
      row(3, "2026-09-20"),
      row(4, "2026-09-14"),
      row(5, "2026-09-24"),
      row(6, null, "2026-09-22"), // no latest date: the next episode's stands in
      row(7, null), // nothing dated at all: last
    ];
    expect(order(backlogRows(rows))).toEqual([5, 6, 2, 3, 4, 1, 7]);
  });

  it("caps the strip at the most recent", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i + 1, `2026-09-${String(i + 1).padStart(2, "0")}`));
    const shown = backlogRows(rows);
    expect(shown).toHaveLength(BACKLOG_ROWS);
    expect(shown[0].showId).toBe(20);
    expect(backlogRows([])).toEqual([]);
  });

  it("reads Still to watch's rows, so Stop watching takes a show off", async () => {
    const before = await getBacklog(userId, today);
    expect(before.total).toBe(3);
    await db.droppedShow.create({ data: { userId, showId: 200, showName: "alpha" } });
    const after = await getBacklog(userId, today);
    expect(after.total).toBe(2);
    expect(after.rows.map((r) => r.showId)).not.toContain(200);
  });
});
