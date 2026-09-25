import "server-only";
import { db } from "./db";
import { marksFor } from "./home";
import { titleKey, type Mark } from "./marks";
import { expandProviders, parseProviders, regionFor, subscribedAmong, summaryFor } from "./providers";
import {
  sortRows,
  type FavouriteSort,
  type ListSort,
  type WatchlistSort,
} from "./list-sorts";
import type { SaveList } from "./save-behaviour";
import type { MediaType } from "./tmdb";

/**
 * The lists section, read from rows and nothing else. Smart lists never
 * rebuild on view: the daily job keeps their rows, and opening one is a read.
 *
 * Three kinds of thing live here and only one is a `MediaList`: the watchlist
 * and favourites are fixed parts of the app with tables of their own.
 */

/** A title as a poster wants it, whichever table it came from. */
export type ListTitle = {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number | null;
  year: string | null;
  runtime: number | null;
  mark: Mark;
};

/** How many posters the overview's rails carry before the chevron is the better answer. */
export const RAIL_SIZE = 20;
/** Posters behind a list tile: the mosaic is two by two. */
const MOSAIC = 4;

const media = (t: string): MediaType => (t === "tv" ? "tv" : "movie");

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Whether a watchlist row is streaming now: on a service this person pays for,
 * when they have named any, else anywhere at all. The ids are what compare,
 * because TMDB lists one service under several (see `KNOWN_PROVIDERS`).
 */
export function streamingNow(row: { streaming: string | null; streamingIds: string | null }, mine: ReadonlySet<number>) {
  if (!row.streaming) return false;
  if (mine.size === 0) return true;
  return (row.streamingIds ?? "")
    .split(",")
    .map(Number)
    .some((id) => mine.has(id));
}

// ---------------------------------------------------------------------------
// The watchlist and favourites

/** Every watchlist row in the chosen order, with its mark and whether it is streaming now. */
export async function watchlistRows(userId: string, sort: WatchlistSort) {
  const [rows, me] = await Promise.all([
    db.watchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
      select: { mediaType: true, tmdbId: true, title: true, poster: true, score: true, runtime: true, streaming: true, streamingIds: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { providers: true } }),
  ]);
  const mine = expandProviders(parseProviders(me?.providers));
  const years = await yearsFor(rows);
  const shaped = rows.map((r) => ({
    mediaType: media(r.mediaType),
    tmdbId: r.tmdbId,
    title: r.title,
    poster: r.poster,
    score: r.score,
    year: years.get(titleKey(r.mediaType, r.tmdbId)) ?? null,
    runtime: r.runtime,
    streaming: streamingNow(r, mine),
  }));
  return { rows: sortRows(shaped, sort), streamingCount: shaped.filter((r) => r.streaming).length };
}

export async function favouriteRows(userId: string, sort: FavouriteSort) {
  const rows = await db.favourite.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    select: { mediaType: true, tmdbId: true, title: true, poster: true, score: true },
  });
  const years = await yearsFor(rows);
  return sortRows(
    rows.map((r) => ({ ...r, mediaType: media(r.mediaType), year: years.get(titleKey(r.mediaType, r.tmdbId)) ?? null, runtime: null })),
    sort,
  );
}

/**
 * Release years for watchlist and favourite rows, which carry none of their
 * own, from `TitleMeta` (filled from the cached details by the badge and
 * refresh passes): one read for the lot, and a title not described yet simply
 * shows its kind without a year until it is.
 */
async function yearsFor(rows: { mediaType: string; tmdbId: number }[]): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  const meta = await db.titleMeta.findMany({
    where: { tmdbId: { in: [...new Set(rows.map((r) => r.tmdbId))] }, releaseDate: { not: null } },
    select: { mediaType: true, tmdbId: true, releaseDate: true },
  });
  return new Map(meta.map((m) => [titleKey(m.mediaType, m.tmdbId), m.releaseDate!.slice(0, 4)]));
}

/** Marks for a batch of rows, attached. */
export async function withMarks<T extends { mediaType: MediaType; tmdbId: number }>(rows: T[]): Promise<(T & { mark: Mark })[]> {
  const marks = await marksFor(rows);
  return rows.map((r) => ({ ...r, mark: marks[titleKey(r.mediaType, r.tmdbId)] ?? null }));
}

// ---------------------------------------------------------------------------
// The overview

export type ListCard = {
  id: string;
  name: string;
  kind: "manual" | "smart";
  count: number;
  /** Up to four poster paths, with the title for when there is no artwork. */
  mosaic: { poster: string | null; title: string }[];
};

export async function listCards(userId: string): Promise<ListCard[]> {
  const lists = await db.mediaList.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      kind: true,
      items: { orderBy: { position: "asc" }, take: MOSAIC, select: { poster: true, title: true } },
      _count: { select: { items: true } },
    },
  });
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind === "smart" ? "smart" : "manual",
    count: l._count.items,
    mosaic: l.items,
  }));
}

// ---------------------------------------------------------------------------
// One list

export type ListDetail = {
  id: string;
  name: string;
  kind: "manual" | "smart";
  refreshedAt: Date | null;
  updatedAt: Date;
  items: (ListTitle & { watched: boolean })[];
  minutes: number;
  watchedCount: number;
  mosaic: { poster: string | null; title: string }[];
};

/** A list and its titles, or null when it is not this person's. */
export async function listDetail(userId: string, listId: string, sort: ListSort): Promise<ListDetail | null> {
  const list = await db.mediaList.findFirst({
    where: { id: listId, userId },
    select: {
      id: true,
      name: true,
      kind: true,
      refreshedAt: true,
      updatedAt: true,
      items: {
        orderBy: { position: "asc" },
        select: { mediaType: true, tmdbId: true, title: true, poster: true, score: true, year: true, runtime: true },
      },
    },
  });
  if (!list) return null;

  const items = list.items.map((i) => ({ ...i, mediaType: media(i.mediaType) }));
  const films = items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId);
  const shows = items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId);
  const [seenFilms, seenShows, marked] = await Promise.all([
    films.length
      ? db.watchedMovie.findMany({ where: { userId, movieId: { in: films } }, select: { movieId: true } })
      : [],
    shows.length
      ? db.watchedEpisode.findMany({ where: { userId, showId: { in: shows } }, select: { showId: true }, distinct: ["showId"] })
      : [],
    withMarks(items),
  ]);
  const seen = new Set([...seenFilms.map((f) => `movie-${f.movieId}`), ...seenShows.map((s) => `tv-${s.showId}`)]);
  const rows = marked.map((i) => ({ ...i, watched: seen.has(titleKey(i.mediaType, i.tmdbId)) }));

  return {
    id: list.id,
    name: list.name,
    kind: list.kind === "smart" ? "smart" : "manual",
    refreshedAt: list.refreshedAt,
    updatedAt: list.updatedAt,
    items: sortRows(rows, sort),
    minutes: rows.reduce((sum, r) => sum + (r.runtime ?? 0), 0),
    watchedCount: rows.filter((r) => r.watched).length,
    mosaic: items.slice(0, MOSAIC).map((i) => ({ poster: i.poster, title: i.title })),
  };
}

/** A smart list's filters, for the editor. Null when it is not this person's smart list. */
export async function smartListForEdit(userId: string, listId: string) {
  return db.mediaList.findFirst({
    where: { id: listId, userId, kind: "smart" },
    select: { id: true, name: true, filters: true, autoRequest: true },
  });
}

// ---------------------------------------------------------------------------
// Save on a title page

/**
 * The manual lists and whether each holds this title, for Save's menu. Smart
 * lists are left out on purpose: what is on one is the answer to its filters,
 * and a title put there by hand would be gone at the next rebuild.
 */
export async function saveLists(userId: string, mediaType: MediaType, tmdbId: number): Promise<SaveList[]> {
  const [lists, holding] = await Promise.all([
    db.mediaList.findMany({ where: { userId, kind: "manual" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.mediaListItem.findMany({ where: { list: { userId, kind: "manual" }, mediaType, tmdbId }, select: { listId: true } }),
  ]);
  const held = new Set(holding.map((h) => h.listId));
  return lists.map((l) => ({ ...l, holds: held.has(l.id) }));
}

// ---------------------------------------------------------------------------
// Writes

export const LIST_NAME_MAX = 60;

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, LIST_NAME_MAX);
  return name || null;
}

export async function createManualList(userId: string, name: string) {
  return db.mediaList.create({ data: { userId, name, kind: "manual" }, select: { id: true } });
}

export async function renameList(userId: string, listId: string, name: string) {
  const { count } = await db.mediaList.updateMany({ where: { id: listId, userId }, data: { name } });
  return count > 0;
}

export async function deleteList(userId: string, listId: string) {
  const { count } = await db.mediaList.deleteMany({ where: { id: listId, userId } });
  return count > 0;
}

export type NewItem = {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number | null;
  year: string | null;
  runtime: number | null;
};

/** Puts a title on a manual list, last. Smart lists refuse: their rows are the job's. */
export async function addToList(userId: string, listId: string, item: NewItem) {
  const list = await db.mediaList.findFirst({ where: { id: listId, userId, kind: "manual" }, select: { id: true } });
  if (!list) return false;
  const last = await db.mediaListItem.findFirst({ where: { listId }, orderBy: { position: "desc" }, select: { position: true } });
  await db.mediaListItem.upsert({
    where: { listId_mediaType_tmdbId: { listId, mediaType: item.mediaType, tmdbId: item.tmdbId } },
    create: { listId, ...item, position: (last?.position ?? -1) + 1 },
    update: {},
  });
  // The list's own "updated" line.
  await db.mediaList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
  return true;
}

export async function removeFromList(userId: string, listId: string, mediaType: MediaType, tmdbId: number) {
  const list = await db.mediaList.findFirst({ where: { id: listId, userId, kind: "manual" }, select: { id: true } });
  if (!list) return false;
  await db.mediaListItem.deleteMany({ where: { listId, mediaType, tmdbId } });
  await db.mediaList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
  return true;
}

export async function removeFromWatchlist(userId: string, mediaType: MediaType, tmdbId: number) {
  await db.watchlistItem.deleteMany({ where: { userId, mediaType, tmdbId } });
}

/**
 * Writes a smart list's name and question. An edited list goes back to
 * "never built" (`refreshedAt` null), which is what the page's "being built"
 * line reads until the queued build lands; its old rows stay until then.
 * `autoRequest` undefined leaves the switch as it was: the editor only offers
 * it while Overseerr is connected, and a save without it must not turn it off.
 */
export async function saveSmartList(userId: string, listId: string | null, name: string, filters: string, autoRequest?: boolean) {
  if (listId) {
    const { count } = await db.mediaList.updateMany({
      where: { id: listId, userId, kind: "smart" },
      data: { name, filters, refreshedAt: null, autoRequest },
    });
    return count > 0 ? listId : null;
  }
  const created = await db.mediaList.create({
    data: { userId, name, kind: "smart", filters, autoRequest: autoRequest ?? false },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// Requesting what a smart list finds

/** The most one press will ask Overseerr for. A standing question can find sixty. */
export const REQUEST_ALL_CAP = 20;

export type RequestPlan = {
  /** Unseen, not on Plex, not already requested or available: what Request all would ask for. */
  titles: { mediaType: MediaType; tmdbId: number; title: string }[];
  /** Those among them already streaming on a service this person pays for, with where. */
  subscribed: { mediaType: MediaType; tmdbId: number; title: string; on: string[] }[];
};

/**
 * What Request all on a smart list would file, from rows only: the list's
 * titles in order, less anything this person has seen and anything Overseerr
 * or Plex already has, capped. Those streaming on something they pay for are
 * named, so the button can ask first, as the title page's Request does.
 */
export async function requestPlan(userId: string, listId: string): Promise<RequestPlan | null> {
  const [list, me] = await Promise.all([
    db.mediaList.findFirst({
      where: { id: listId, userId, kind: "smart" },
      select: { items: { orderBy: { position: "asc" }, select: { mediaType: true, tmdbId: true, title: true } } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { region: true, providers: true } }),
  ]);
  if (!list) return null;
  const items = list.items.map((i) => ({ ...i, mediaType: media(i.mediaType) }));
  const ids = (t: MediaType) => items.filter((i) => i.mediaType === t).map((i) => i.tmdbId);

  const [seenFilms, seenShows, rows] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId, movieId: { in: ids("movie") } }, select: { movieId: true } }),
    db.watchedEpisode.findMany({ where: { userId, showId: { in: ids("tv") } }, select: { showId: true }, distinct: ["showId"] }),
    db.availability.findMany({
      where: {
        OR: [
          { mediaType: "movie", tmdbId: { in: ids("movie") } },
          { mediaType: "tv", tmdbId: { in: ids("tv") } },
        ],
      },
      select: { mediaType: true, tmdbId: true, onPlex: true, overseerrStatus: true, providers: true },
    }),
  ]);
  const seen = new Set([...seenFilms.map((f) => `movie-${f.movieId}`), ...seenShows.map((s) => `tv-${s.showId}`)]);
  const byKey = new Map(rows.map((r) => [titleKey(r.mediaType, r.tmdbId), r]));
  const region = regionFor(me?.region);
  const mine = parseProviders(me?.providers);

  const titles = items
    .filter((i) => {
      const key = titleKey(i.mediaType, i.tmdbId);
      const row = byKey.get(key);
      return !seen.has(key) && !row?.onPlex && (row?.overseerrStatus ?? "none") === "none";
    })
    .slice(0, REQUEST_ALL_CAP);

  const subscribed = titles
    .map((t) => {
      const offers = summaryFor(byKey.get(titleKey(t.mediaType, t.tmdbId))?.providers, region);
      const on = offers ? subscribedAmong(mine, [...offers.stream, ...offers.free]) : [];
      return { ...t, on };
    })
    .filter((t) => t.on.length > 0);

  return { titles, subscribed };
}
