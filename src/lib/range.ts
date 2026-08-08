/**
 * The window the profile page is looking through.
 *
 * Plain data with no server dependency, so both the server reads and the client
 * filter bar can import it. Boundaries are local-time calendar edges rather than
 * rolling windows — "this year" means January onwards, not the last 365 days,
 * because that is what people mean when they say it.
 */

export const RANGE_KEYS = ["month", "year", "last-year", "all"] as const;

export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  month: "This month",
  year: "This year",
  "last-year": "Last year",
  all: "All time",
};

export type Range = {
  key: RangeKey;
  label: string;
  /** Inclusive lower bound; null for all time. */
  from: Date | null;
  /** Exclusive upper bound; null for "up to now". */
  to: Date | null;
  /**
   * How the line chart should bucket this window. A month wants days, a year
   * wants months, and all of time wants years — one shape for all three would
   * be either twelve points for a decade or three hundred for a month.
   */
  buckets: "day" | "month" | "year";
};

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && (RANGE_KEYS as readonly string[]).includes(value);
}

export function resolveRange(key: RangeKey): Range {
  const now = new Date();
  const label = RANGE_LABELS[key];

  switch (key) {
    case "month":
      return {
        key,
        label,
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: null,
        buckets: "day",
      };
    case "year":
      return { key, label, from: new Date(now.getFullYear(), 0, 1), to: null, buckets: "month" };
    case "last-year":
      return {
        key,
        label,
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear(), 0, 1),
        buckets: "month",
      };
    case "all":
      return { key, label, from: null, to: null, buckets: "year" };
  }
}

/**
 * Whether a range actually narrows anything.
 *
 * "All time" is a range object like any other, but it filters nothing — and the
 * reads that answer "how many *different* films" have a cheap path for the
 * unfiltered case, over the watched tables, and an expensive one over the play
 * log. Branching on the range merely *existing* sent the default view down the
 * expensive path, where the cost is one row per viewing rather than one per
 * title. On an account with a lot of rewatches that is the difference between a
 * page and a hang.
 */
export function isBounded(range?: Range | null) {
  return Boolean(range?.from || range?.to);
}

/** Prisma `where` fragment for a range. Empty object for all time. */
export function rangeFilter(range: Range) {
  if (!range.from && !range.to) return {};
  return {
    watchedAt: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lt: range.to } : {}),
    },
  };
}
