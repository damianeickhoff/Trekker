import { beforeEach, describe, expect, it } from "vitest";
import { getHeatmap } from "@/lib/heatmap";
import { recordPlay } from "@/lib/plays";
import { film, freshUser } from "./helpers/db";

/**
 * The one thing worth guarding here is the day boundary.
 *
 * `watchedAt` is an instant. Grouping it by UTC — which is what `date()` in
 * SQLite would do — puts an episode finished at half eleven on a winter evening
 * onto tomorrow's square for anyone east of Greenwich, and it is the kind of
 * wrong nobody notices until they count their own streak.
 */

let userId: string;

beforeEach(async () => {
  userId = (await freshUser()).id;
});

/** Local midnight-adjacent times, built in the runner's own zone. */
function localTime(daysAgo: number, hour: number, minute = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function key(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

describe("getHeatmap", () => {
  it("is empty for an account that has watched nothing", async () => {
    const heatmap = await getHeatmap(userId);
    expect(heatmap.days).toEqual([]);
    expect(heatmap.total).toBe(0);
    expect(heatmap.peak).toBe(0);
  });

  it("buckets a late-night viewing on the local day it happened", async () => {
    const late = localTime(2, 23, 30);
    await recordPlay(userId, { ...film(), watchedAt: late });

    const heatmap = await getHeatmap(userId);

    expect(heatmap.days).toHaveLength(1);
    expect(heatmap.days[0].date).toBe(key(late));
  });

  it("keeps an early-morning viewing on its own day too", async () => {
    // The other end of the same problem: 00:30 local is the previous day in any
    // zone west of Greenwich.
    const early = localTime(3, 0, 30);
    await recordPlay(userId, { ...film(), watchedAt: early });

    const heatmap = await getHeatmap(userId);
    expect(heatmap.days[0].date).toBe(key(early));
  });

  it("adds up minutes and viewings within a day", async () => {
    await recordPlay(userId, { ...film(), watchedAt: localTime(1, 20) });
    // Outside the four-hour film window, so this is a second viewing.
    await recordPlay(userId, { ...film(), watchedAt: localTime(1, 9) });

    const heatmap = await getHeatmap(userId);

    expect(heatmap.days).toHaveLength(1);
    expect(heatmap.days[0].plays).toBe(2);
    expect(heatmap.days[0].minutes).toBe(139 * 2);
  });

  it("returns days oldest first, so the grid can be drawn in order", async () => {
    await recordPlay(userId, { ...film(), watchedAt: localTime(1, 20) });
    await recordPlay(userId, { ...film({ tmdbId: 27205 }), watchedAt: localTime(5, 20) });
    await recordPlay(userId, { ...film({ tmdbId: 155 }), watchedAt: localTime(3, 20) });

    const heatmap = await getHeatmap(userId);
    const dates = heatmap.days.map((day) => day.date);

    expect(dates).toEqual([...dates].sort());
  });

  it("scales against the busiest day rather than a fixed ceiling", async () => {
    await recordPlay(userId, { ...film(), watchedAt: localTime(1, 20) });
    await recordPlay(userId, { ...film(), watchedAt: localTime(1, 9) });
    await recordPlay(userId, { ...film({ tmdbId: 27205 }), watchedAt: localTime(4, 20) });

    const heatmap = await getHeatmap(userId);
    expect(heatmap.peak).toBe(139 * 2);
  });

  it("starts the window on a Monday so the first column is whole", async () => {
    const heatmap = await getHeatmap(userId, 4);
    const start = new Date(`${heatmap.from}T12:00:00`);
    // 1 is Monday in JS's numbering.
    expect(start.getDay()).toBe(1);
  });

  it("leaves out anything older than the window", async () => {
    await recordPlay(userId, { ...film(), watchedAt: localTime(400, 20) });
    const heatmap = await getHeatmap(userId, 4);
    expect(heatmap.days).toEqual([]);
  });

  it("never counts somebody else's viewing", async () => {
    const other = (await freshUser()).id;
    await recordPlay(other, { ...film(), watchedAt: localTime(1, 20) });

    expect((await getHeatmap(userId)).total).toBe(0);
  });
});
