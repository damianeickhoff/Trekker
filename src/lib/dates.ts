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
