import "server-only";
import { todayKey } from "./dates";
import { db } from "./db";
import { getUpNext, type UpNextRow } from "./title-state";

/**
 * `/waiting`, "Still to watch": every show with an aired episode unseen, in
 * one of four orders, with how long the lot would take. Rows only, like Home.
 */

export type WaitingSort = "next" | "az" | "left" | "aired";

/** The chips, in the order they are drawn. The first is the default and has no parameter. */
export const WAITING_SORTS: [WaitingSort, string][] = [
  ["next", "Up next order"],
  ["az", "A–Z"],
  ["left", "Most left"],
  ["aired", "Recently aired"],
];

export function parseWaitingSort(value: string | undefined): WaitingSort {
  return WAITING_SORTS.some(([s]) => s === value) ? (value as WaitingSort) : "next";
}

/** Aired and unseen. Never less than one: a row is only here because one is waiting. */
export function episodesLeft(row: Pick<UpNextRow, "airedCount" | "watchedCount">) {
  return Math.max(row.airedCount - row.watchedCount, 1);
}

const byName = new Intl.Collator("en-GB", { sensitivity: "base", numeric: true });

/**
 * Reorders Home's list. Every order falls back to Home's own for ties (the
 * sort is stable over rows already in that order), so two shows with the same
 * number left or the same air date sit as they do on Home, and a render never
 * shuffles them. "Recently aired" is the show's latest aired episode, newest
 * first: what just came out, not how far behind this person is.
 */
export function sortWaiting(rows: UpNextRow[], sort: WaitingSort): UpNextRow[] {
  const list = [...rows];
  switch (sort) {
    case "az":
      return list.sort((a, b) => byName.compare(a.showName, b.showName));
    case "left":
      return list.sort((a, b) => episodesLeft(b) - episodesLeft(a));
    case "aired": {
      const latest = (r: UpNextRow) => r.lastAirDate ?? r.airDate ?? "";
      return list.sort((a, b) => latest(b).localeCompare(latest(a)));
    }
    default:
      return list;
  }
}

/** Runtime for an episode TMDB gives none for, as the progress panel assumes. */
const FALLBACK_MINUTES = 45;

/**
 * How long everything waiting would take: each aired, unseen episode in a
 * numbered season, at its own runtime where the episode list has one. Two
 * narrow reads over the shows on the page, whatever their number.
 */
export async function minutesLeft(userId: string, rows: UpNextRow[], today = todayKey()): Promise<number> {
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.showId);
  const [aired, seen] = await Promise.all([
    db.showEpisode.findMany({
      where: { showId: { in: ids }, seasonNumber: { gt: 0 }, airDate: { lte: today } },
      select: { showId: true, seasonNumber: true, episodeNumber: true, runtime: true },
    }),
    db.watchedEpisode.findMany({
      where: { userId, showId: { in: ids }, seasonNumber: { gt: 0 } },
      select: { showId: true, seasonNumber: true, episodeNumber: true },
    }),
  ]);
  const watched = new Set(seen.map((w) => `${w.showId}:${w.seasonNumber}:${w.episodeNumber}`));
  const fallback = new Map(rows.map((r) => [r.showId, r.runtime ?? FALLBACK_MINUTES]));
  return aired
    .filter((e) => !watched.has(`${e.showId}:${e.seasonNumber}:${e.episodeNumber}`))
    .reduce((sum, e) => sum + (e.runtime ?? fallback.get(e.showId) ?? FALLBACK_MINUTES), 0);
}

export async function getWaiting(userId: string, sort: WaitingSort, today = todayKey()) {
  const rows = await getUpNext(userId, Infinity, today);
  const minutes = await minutesLeft(userId, rows, today);
  return { rows: sortWaiting(rows, sort), minutes };
}

// ---------------------------------------------------------------------------
// The calendar's backlog

/** Posters the calendar's strip holds; `/waiting` has the rest. */
export const BACKLOG_ROWS = 12;

/**
 * The calendar's backlog: what has aired and is still unseen, newest first by
 * the show's latest aired episode, capped. The latest episode rather than the
 * one to watch next, because the question under a calendar is what arrived
 * lately, and a show twenty episodes behind would otherwise always sort last.
 */
export function backlogRows(rows: UpNextRow[], cap = BACKLOG_ROWS): UpNextRow[] {
  return sortWaiting(rows, "aired").slice(0, cap);
}

export async function getBacklog(userId: string, today = todayKey()) {
  const rows = await getUpNext(userId, Infinity, today);
  return { rows: backlogRows(rows), total: rows.length };
}
