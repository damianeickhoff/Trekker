/**
 * Date formatting shared by server and client. Deliberately free of both
 * `server-only` and `"use client"` — a helper exported from a client module
 * cannot be called during server rendering, only rendered as a component.
 */

/** "Watched 3 Aug 2026" — the same wording everywhere a watch date is shown. */
export function formatWatched(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * "3 Aug ’26" — the same date, for somewhere there is no room for it.
 *
 * Only for the watched chip, which sits inline beside an episode title on a
 * phone: four characters of century in a pill that has to share a line with a
 * name is four characters nobody reads. Everywhere the date is a line of its
 * own it stays spelled out.
 *
 * Built by hand rather than with `year: "2-digit"` because that yields a bare
 * "26", which reads as a day of the month sitting next to one.
 */
export function formatWatchedShort(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const day = value.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return `${day} ’${String(value.getFullYear()).slice(-2)}`;
}
