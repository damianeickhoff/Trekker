import "server-only";
import { db } from "./db";

/**
 * A year of watching, one square per day.
 *
 * The classic tracker view, and the one thing the profile could not do despite
 * having every byte for it — the file that used to bear this name held
 * `getOnThisDay`, which answers a different question entirely and now lives in
 * `on-this-day.ts`.
 *
 * Bucketed by **local** day, deliberately. `watchedAt` is an instant; asking
 * SQLite to group by `date(watchedAt)` would group by UTC, and an episode
 * finished at half past eleven on a winter evening would land on tomorrow's
 * square for anybody east of Greenwich. The rows are small enough to fold in
 * memory, so they are folded where the timezone is known.
 */

export type HeatmapDay = {
  /** `YYYY-MM-DD` in local time — the key the grid is drawn from. */
  date: string;
  minutes: number;
  plays: number;
};

export type Heatmap = {
  days: HeatmapDay[];
  /** Inclusive bounds, so the grid knows how many columns to draw. */
  from: string;
  to: string;
  /** The busiest day's minutes, which is what the shading is scaled against. */
  peak: number;
  total: number;
};

function localKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The last `weeks` weeks, ending today.
 *
 * 53 rather than 52 so the grid always covers a full year even when today sits
 * mid-week — a 52-column grid drops the same weekday from a year ago, which is
 * exactly the comparison somebody looking at this wants to make.
 */
export async function getHeatmap(userId: string, weeks = 53): Promise<Heatmap> {
  const today = new Date();

  // Back to the Monday of the earliest week, so the first column is whole.
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const plays = await db.play.findMany({
    where: { userId, watchedAt: { gte: start } },
    select: { watchedAt: true, runtime: true },
  });

  const byDay = new Map<string, HeatmapDay>();

  for (const play of plays) {
    const key = localKey(play.watchedAt);
    const day = byDay.get(key) ?? { date: key, minutes: 0, plays: 0 };
    day.minutes += play.runtime;
    day.plays += 1;
    byDay.set(key, day);
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    from: localKey(start),
    to: localKey(today),
    /**
     * The busiest day sets the top of the scale, rather than a fixed number of
     * minutes. A fixed ceiling makes a light week look empty and a binge week
     * look uniform; scaling to the person means the grid says something about
     * *their* year either way.
     */
    peak: days.reduce((most, day) => Math.max(most, day.minutes), 0),
    total: days.reduce((sum, day) => sum + day.minutes, 0),
  };
}
