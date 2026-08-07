/**
 * Duration formatting, kept out of `stats.ts` because that module is
 * `server-only` and these two are needed inside client components — the history
 * feed renders day totals as it scrolls. Nothing here touches the database, so
 * there was never a reason for it to be server-bound.
 */

export function formatHours(minutes: number) {
  const hours = minutes / 60;
  if (hours < 1) return `${minutes}m`;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours).toLocaleString("en-GB")}h`;
}

/**
 * How wide to draw a progress bar, as a percentage.
 *
 * A bar at 1% is a sliver too thin to see, so anything above zero is floored at
 * a couple of percent — but *zero has to stay zero*. Flooring it unconditionally
 * is what left the level bar looking part-filled for someone who had earned
 * nothing at all, which is worse than no bar: it claims progress that has not
 * happened.
 */
export function barWidth(percent: number, floor = 2) {
  if (!(percent > 0)) return 0;
  return Math.min(100, Math.max(floor, percent));
}

/** "3d 4h" — the fun version for the profile page. */
export function formatSpan(minutes: number) {
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
