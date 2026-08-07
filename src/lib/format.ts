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

/** "3d 4h" — the fun version for the profile page. */
export function formatSpan(minutes: number) {
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
