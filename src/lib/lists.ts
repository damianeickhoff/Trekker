import "server-only";
import { db } from "./db";
import { findGenre } from "./genres";
import { describeFilters, parseFilters, type SmartFilters } from "./smart-filters";
import { getViewerState, runSmartList } from "./smart-lists";
import type { NormalisedItem } from "./tmdb";

/**
 * Reading the lists section.
 *
 * Three kinds of thing live side by side here and only one of them is a row in
 * `MediaList`: the watchlist and the favourites are fixed parts of the app with
 * tables of their own. `ListView` is the shape they are all flattened into, so
 * the overview page can render one rail per list without caring which is which
 * — the `kind` is carried along for the handful of places that do care (a smart
 * list gets an edit link, the watchlist cannot be deleted).
 */

export type ListKind = "watchlist" | "favourites" | "manual" | "smart";

/**
 * A title on a list, in the shape a poster card wants, plus the row id it came
 * from where there is one — that is what the remove button on a manual list
 * needs, and neither the watchlist nor a smart list has any use for it.
 */
export type ListItemView = NormalisedItem & { itemId?: string };

export type ListView = {
  /** The `MediaList` id, or the fixed slug for the two built-in lists. */
  id: string;
  kind: ListKind;
  name: string;
  /** One line under the name: the question a smart list asks, or a count. */
  description: string;
  href: string;
  count: number;
  items: ListItemView[];
  /** Smart lists only. */
  filters: SmartFilters | null;
  refreshedAt: Date | null;
};

/** How many titles a smart list keeps. Deeper than a rail, shallow enough to store. */
export const SMART_LIST_SIZE = 60;

/**
 * The furthest "show me more" will ever go on a smart list.
 *
 * Only the first `SMART_LIST_SIZE` are stored; past that the list page fetches
 * on demand, and this is where that stops. Two hundred posters is already more
 * than anyone scrolls through, and the number exists so that scrolling cannot
 * turn into an unbounded walk down TMDB's five hundred pages — the browser
 * would give out long before the API did.
 */
export const SMART_LIST_MAX = 200;

/** How many more arrive per scroll. One TMDB page's worth. */
export const SMART_LIST_STEP = 20;

/** How many go on a rail before "see all" is the better answer. */
const RAIL_SIZE = 20;

/** Posters behind a list tile. Four, because the mosaic is two by two. */
const MOSAIC_SIZE = 4;

/** A stored smart list older than this is rebuilt the next time it is looked at. */
const REFRESH_AFTER = 24 * 60 * 60 * 1000;

function genreLabel(slug: string) {
  return findGenre(slug)?.label ?? slug;
}

/** Rows out of any of the three tables, in the shape a poster card wants. */
function toItem(row: {
  id?: string;
  mediaType: string;
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number | null;
  year?: string | null;
}): ListItemView {
  return {
    itemId: row.id,
    id: row.tmdbId,
    mediaType: row.mediaType === "tv" ? "tv" : "movie",
    title: row.title,
    poster: row.poster,
    backdrop: null,
    score: row.score ?? 0,
    year: row.year ?? null,
    overview: "",
  };
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/* ==========================================================================
 * Smart lists: keeping the cache honest
 * ======================================================================== */

type StoredList = {
  id: string;
  userId: string;
  name: string;
  kind: string;
  filters: string | null;
  refreshedAt: Date | null;
};

/**
 * Rebuilds a smart list from its filters and replaces its cached titles.
 *
 * The whole set is thrown away and rewritten rather than reconciled: a smart
 * list has no membership to preserve — nothing is "on" it in a way that
 * survives the question being asked again — and position matters, so patching
 * would be more code for a worse answer.
 *
 * `refreshedAt` is stamped even when TMDB returns nothing. Otherwise a list
 * whose filters genuinely match nothing would be retried on every single page
 * view for as long as it existed.
 */
export async function refreshSmartList(list: StoredList): Promise<NormalisedItem[]> {
  const filters = parseFilters(list.filters);
  const viewer =
    filters.hideWatched || filters.hideSaved
      ? await getViewerState(list.userId)
      : undefined;

  const items = await runSmartList(filters, SMART_LIST_SIZE, viewer).catch(() => []);

  await db.$transaction([
    db.mediaListItem.deleteMany({ where: { listId: list.id } }),
    db.mediaListItem.createMany({
      data: items.map((item, index) => ({
        listId: list.id,
        mediaType: item.mediaType,
        tmdbId: item.id,
        title: item.title,
        poster: item.poster,
        score: item.score || null,
        year: item.year,
        position: index,
      })),
    }),
    db.mediaList.update({ where: { id: list.id }, data: { refreshedAt: new Date() } }),
  ]);

  return items;
}

export function isStale(refreshedAt: Date | null): boolean {
  return !refreshedAt || Date.now() - refreshedAt.getTime() > REFRESH_AFTER;
}

/**
 * How many stale lists one page view is willing to rebuild.
 *
 * The nightly job has no such limit — it has all night. This one is on the
 * critical path of a page render, and someone with eight smart lists should not
 * wait for eight fans of TMDB requests because they opened the lists page first
 * that morning. Whatever is left over keeps showing yesterday's answer, which
 * is what a smart list is for, and is picked up on the next view or by the job.
 */
const PER_VIEW = 3;

/**
 * Every smart list of the user's that has aged out, brought up to date.
 *
 * Called from the overview page as well as from the nightly job, so the feature
 * works on an instance where nobody ever set the cron entry up. Serial rather
 * than parallel: each one of these is already several TMDB requests, and a user
 * with ten lists firing thirty at once is how you get rate limited.
 */
export async function refreshStaleLists(userId: string, limit = PER_VIEW): Promise<number> {
  const lists = await db.mediaList.findMany({
    where: { userId, kind: "smart" },
    // Oldest first, so a list that missed its turn last time gets it now rather
    // than being starved behind the same three every view. Nulls — never built
    // at all — sort first, which is exactly the right priority.
    orderBy: { refreshedAt: "asc" },
  });

  const stale = lists.filter((list) => isStale(list.refreshedAt)).slice(0, limit);

  for (const list of stale) {
    await refreshSmartList(list).catch(() => undefined);
  }

  return stale.length;
}

/* ==========================================================================
 * Reads
 * ======================================================================== */

/** A list as a tile on the overview: a name, a count, and something to look at. */
export type ListCardView = {
  id: string;
  name: string;
  description: string;
  count: number;
  kind: "manual" | "smart";
  /** Up to four poster paths, for the mosaic on the tile. */
  posters: string[];
  refreshedAt: Date | null;
};

/**
 * The lists page, in four rows.
 *
 * The watchlist and the favourites are rows of *titles*, because each is one
 * list and what you want from it is to see what is on it. The lists you made
 * are rows of *lists* — one tile apiece, however many you have — because there
 * is no limit on how many there might be, and a page that grew a new full-width
 * rail every time somebody made a list would stop being an overview at about
 * the fourth one.
 *
 * The first two always appear, empty or not: they are part of the furniture,
 * and a lists page that hid the watchlist because you had cleared it would look
 * broken. The other two rows appear only once there is something in them.
 */
export type ListsOverview = {
  watchlist: ListView;
  favourites: ListView;
  manual: ListCardView[];
  smart: ListCardView[];
};

export async function getListsOverview(userId: string): Promise<ListsOverview> {
  await refreshStaleLists(userId).catch(() => undefined);

  const [watchlist, watchlistCount, favourites, favouritesCount, lists] = await Promise.all([
    db.watchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
      take: RAIL_SIZE,
    }),
    db.watchlistItem.count({ where: { userId } }),
    db.favourite.findMany({ where: { userId }, orderBy: { addedAt: "desc" }, take: RAIL_SIZE }),
    db.favourite.count({ where: { userId } }),
    db.mediaList.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        // Only enough for the mosaic on the tile. The list's own page reads the
        // rest; the overview never shows more than four of anything.
        items: { orderBy: { position: "asc" }, take: MOSAIC_SIZE, select: { poster: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const cards: ListCardView[] = lists.map((list) => {
    const smart = list.kind === "smart";
    const filters = smart ? parseFilters(list.filters) : null;

    return {
      id: list.id,
      name: list.name,
      kind: smart ? ("smart" as const) : ("manual" as const),
      count: list._count.items,
      description: filters
        ? describeFilters(filters, genreLabel)
        : list._count.items === 0
          ? "Nothing on it yet"
          : plural(list._count.items, "title"),
      posters: list.items
        .map((item) => item.poster)
        .filter((poster): poster is string => Boolean(poster)),
      refreshedAt: list.refreshedAt,
    };
  });

  return {
    manual: cards.filter((card) => card.kind === "manual"),
    smart: cards.filter((card) => card.kind === "smart"),
    watchlist: {
      id: "watchlist",
      kind: "watchlist",
      name: "Watchlist",
      description:
        watchlistCount === 0
          ? "Things you mean to get round to."
          : `${plural(watchlistCount, "title")} waiting for you.`,
      href: "/watchlist/queue",
      count: watchlistCount,
      items: watchlist.map(toItem),
      filters: null,
      refreshedAt: null,
    },
    favourites: {
      id: "favourites",
      kind: "favourites",
      name: "Favourites",
      description:
        favouritesCount === 0
          ? "Everything you have hearted turns up here."
          : `${plural(favouritesCount, "title")} you love.`,
      href: "/watchlist/favourites",
      count: favouritesCount,
      items: favourites.map(toItem),
      filters: null,
      refreshedAt: null,
    },
  };
}

/** One list in full, or null when it is not this user's. */
export async function getList(userId: string, listId: string): Promise<ListView | null> {
  const list = await db.mediaList.findFirst({ where: { id: listId, userId } });
  if (!list) return null;

  // A smart list is rebuilt on the way in when its cache has aged out, so
  // opening one is never a view of yesterday's answer.
  if (list.kind === "smart" && isStale(list.refreshedAt)) {
    await refreshSmartList(list).catch(() => undefined);
  }

  const items = await db.mediaListItem.findMany({
    where: { listId: list.id },
    orderBy: { position: "asc" },
  });

  const smart = list.kind === "smart";
  const filters = smart ? parseFilters(list.filters) : null;

  return {
    id: list.id,
    kind: smart ? "smart" : "manual",
    name: list.name,
    description: filters
      ? describeFilters(filters, genreLabel)
      : items.length === 0
        ? "Nothing on it yet."
        : plural(items.length, "title"),
    href: `/watchlist/list/${list.id}`,
    count: items.length,
    items: items.map(toItem),
    filters,
    refreshedAt: list.refreshedAt,
  };
}

export async function getFavourites(userId: string) {
  const rows = await db.favourite.findMany({ where: { userId }, orderBy: { addedAt: "desc" } });
  return rows.map(toItem);
}

/* ==========================================================================
 * The save button's state
 * ======================================================================== */

export type SaveTarget = { id: string; name: string; holds: boolean };

export type SaveState = {
  /** The watchlist first, then every manual list, in the order they were made. */
  targets: SaveTarget[];
  favourite: boolean;
};

/**
 * What the Save button on a title page needs to know: which of the places a
 * title can be put it is already in.
 *
 * Smart lists are left out on purpose. Their membership is the answer to a
 * question, not something a button can grant — putting a title on one by hand
 * would only survive until the next refresh.
 */
export async function getSaveState(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<SaveState> {
  const [watchlist, favourite, lists, memberships] = await Promise.all([
    db.watchlistItem.findUnique({
      where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } },
      select: { id: true },
    }),
    db.favourite.findUnique({
      where: { userId_mediaType_tmdbId: { userId, mediaType, tmdbId } },
      select: { id: true },
    }),
    db.mediaList.findMany({
      where: { userId, kind: "manual" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    db.mediaListItem.findMany({
      where: { list: { userId, kind: "manual" }, mediaType, tmdbId },
      select: { listId: true },
    }),
  ]);

  const holding = new Set(memberships.map((row) => row.listId));

  return {
    favourite: favourite !== null,
    targets: [
      { id: "watchlist", name: "Watchlist", holds: watchlist !== null },
      ...lists.map((list) => ({ id: list.id, name: list.name, holds: holding.has(list.id) })),
    ],
  };
}
