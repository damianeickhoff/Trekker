/**
 * The popcorn scale: five buckets, stored as 1 to 5 on `Rating.score` and
 * `EpisodeRating.score`. Plain data, read by the picker and by the actions
 * that validate what it sends, so the two cannot disagree about the range.
 */

export const BUCKET_NAMES = ["Spilled", "Empty", "Half full", "Full", "Golden"] as const;

export type Popcorn = 1 | 2 | 3 | 4 | 5;

export function isPopcorn(value: unknown): value is Popcorn {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function bucketName(score: number): string {
  return BUCKET_NAMES[Math.min(Math.max(Math.round(score), 1), 5) - 1];
}

/**
 * An average of popcorn scores, to one decimal, the way the friends' figure is
 * shown. Null for nobody, rather than a zero that would read as a verdict.
 */
export function popcornAverage(scores: number[]): number | null {
  const valid = scores.filter(isPopcorn);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, s) => sum + s, 0) / valid.length) * 10) / 10;
}

/**
 * A percentage as popcorn: `ceil(score / 20)`, the rule the step 2 migration
 * used on the current app's ratings, so an imported Trakt 7 (70%) lands in the
 * same bucket a 70 carried over did. Lossy by design; 0 still counts as spilled.
 */
export function popcornFromPercent(percent: number): Popcorn {
  return Math.min(5, Math.max(1, Math.ceil(percent / 20))) as Popcorn;
}
