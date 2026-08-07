"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "./auth";
import { db } from "./db";
import { refreshSmartList, SMART_LIST_MAX, SMART_LIST_STEP } from "./lists";
import { DEFAULT_FILTERS, parseFilters } from "./smart-filters";
import { genresWithoutTv, getViewerState, runSmartList } from "./smart-lists";
import type { NormalisedItem } from "./tmdb";

/**
 * Everything that writes to a list.
 *
 * The watchlist is addressed by the reserved id `"watchlist"` rather than being
 * given actions of its own, so the Save menu can treat every row it shows the
 * same way — one checkbox, one call, whichever table the answer lands in.
 * `toggleWatchlist` in `actions.ts` still exists and still works; this is the
 * same write behind a different door.
 */

const WATCHLIST = "watchlist";

const title = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int(),
  title: z.string().min(1),
  poster: z.string().nullish(),
  score: z.number().int().nullish(),
  year: z.string().nullish(),
});

export type TitleInput = z.input<typeof title>;

/** Lists show up on the home page rails and in the nav, so redraw the lot. */
function revalidateLists() {
  revalidatePath("/", "layout");
}

/* ==========================================================================
 * Membership
 * ======================================================================== */

/**
 * Adds or removes a title from one place, and says which it did.
 *
 * The answer is the new state rather than "ok", because the button that called
 * this has already drawn the optimistic version and needs to be told when the
 * server disagreed — a list deleted in another tab, say.
 */
export async function toggleInList(input: { listId: string; item: TitleInput }) {
  const user = await requireUser();
  const item = title.parse(input.item);

  if (input.listId === WATCHLIST) {
    const existing = await db.watchlistItem.findUnique({
      where: {
        userId_mediaType_tmdbId: {
          userId: user.id,
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await db.watchlistItem.delete({ where: { id: existing.id } });
    } else {
      await db.watchlistItem.create({
        data: {
          userId: user.id,
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          title: item.title,
          poster: item.poster ?? null,
          score: item.score ?? null,
        },
      });
    }

    revalidateLists();
    return { holds: !existing };
  }

  // Scoped by user as well as by id: an id from a stale page must not be able
  // to write into somebody else's list.
  const list = await db.mediaList.findFirst({
    where: { id: input.listId, userId: user.id, kind: "manual" },
    select: { id: true },
  });
  if (!list) return { holds: false, error: "That list is gone" };

  const existing = await db.mediaListItem.findUnique({
    where: {
      listId_mediaType_tmdbId: {
        listId: list.id,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await db.mediaListItem.delete({ where: { id: existing.id } });
  } else {
    // New titles go to the end. `position` is only ever read in order, so the
    // gaps a removal leaves behind cost nothing.
    const last = await db.mediaListItem.findFirst({
      where: { listId: list.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    await db.mediaListItem.create({
      data: {
        listId: list.id,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        title: item.title,
        poster: item.poster ?? null,
        score: item.score ?? null,
        year: item.year ?? null,
        position: (last?.position ?? -1) + 1,
      },
    });
  }

  revalidateLists();
  return { holds: !existing };
}

/** The heart. One press, no list to choose. */
export async function toggleFavourite(input: TitleInput) {
  const user = await requireUser();
  const item = title.parse(input);

  const key = {
    userId_mediaType_tmdbId: {
      userId: user.id,
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
    },
  };

  const existing = await db.favourite.findUnique({ where: key, select: { id: true } });

  if (existing) {
    await db.favourite.delete({ where: { id: existing.id } });
  } else {
    await db.favourite.create({
      data: {
        userId: user.id,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        title: item.title,
        poster: item.poster ?? null,
        score: item.score ?? null,
      },
    });
  }

  revalidateLists();
  return { favourite: !existing };
}

/** Takes one title off a list, from the list's own page. */
export async function removeFromList(input: { listId: string; itemId: string }) {
  const user = await requireUser();

  const { count } = await db.mediaListItem.deleteMany({
    where: { id: input.itemId, listId: input.listId, list: { userId: user.id } },
  });

  revalidateLists();
  return { removed: count > 0 };
}

/* ==========================================================================
 * The lists themselves
 * ======================================================================== */

const NAME_LIMIT = 60;

const name = z.string().trim().min(1, "Give the list a name").max(NAME_LIMIT);

/**
 * Makes a list. A manual one is empty; a smart one is filled in immediately, so
 * that it is never shown as an empty rail while waiting for the nightly job.
 */
export async function createList(input: {
  name: string;
  kind: "manual" | "smart";
  filters?: unknown;
  /** Optional: put this title on the new list straight away. */
  item?: TitleInput;
}) {
  const user = await requireUser();

  const parsed = name.safeParse(input.name);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const smart = input.kind === "smart";

  const list = await db.mediaList.create({
    data: {
      userId: user.id,
      name: parsed.data,
      kind: smart ? "smart" : "manual",
      filters: smart ? JSON.stringify(parseFilters(input.filters ?? DEFAULT_FILTERS)) : null,
    },
  });

  if (smart) {
    await refreshSmartList(list).catch(() => undefined);
  } else if (input.item) {
    const item = title.parse(input.item);
    await db.mediaListItem.create({
      data: {
        listId: list.id,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        title: item.title,
        poster: item.poster ?? null,
        score: item.score ?? null,
        year: item.year ?? null,
        position: 0,
      },
    });
  }

  revalidateLists();
  return { ok: true as const, id: list.id, name: list.name };
}

export async function renameList(input: { listId: string; name: string }) {
  const user = await requireUser();

  const parsed = name.safeParse(input.name);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const { count } = await db.mediaList.updateMany({
    where: { id: input.listId, userId: user.id },
    data: { name: parsed.data },
  });

  revalidateLists();
  return count > 0 ? { ok: true as const, name: parsed.data } : { ok: false as const, error: "That list is gone" };
}

export async function deleteList(listId: string) {
  const user = await requireUser();
  // Items go with it: the relation cascades.
  await db.mediaList.deleteMany({ where: { id: listId, userId: user.id } });
  revalidateLists();
  return { ok: true };
}

/**
 * Saves a new question onto an existing smart list and answers it at once.
 *
 * The rebuild is not left to the nightly job on purpose: the user has just
 * spent a minute watching a live preview change, and being shown yesterday's
 * answer the moment they press Save would undo all of that.
 */
export async function updateSmartList(input: { listId: string; name?: string; filters: unknown }) {
  const user = await requireUser();

  const list = await db.mediaList.findFirst({
    where: { id: input.listId, userId: user.id, kind: "smart" },
  });
  if (!list) return { ok: false as const, error: "That list is gone" };

  let listName = list.name;
  if (input.name !== undefined) {
    const parsed = name.safeParse(input.name);
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
    listName = parsed.data;
  }

  const filters = JSON.stringify(parseFilters(input.filters));

  const updated = await db.mediaList.update({
    where: { id: list.id },
    data: { name: listName, filters },
  });

  await refreshSmartList(updated).catch(() => undefined);

  revalidateLists();
  return { ok: true as const, id: list.id, name: listName };
}

/** Rebuilds one smart list now, from the list's own page. */
export async function refreshList(listId: string) {
  const user = await requireUser();

  const list = await db.mediaList.findFirst({
    where: { id: listId, userId: user.id, kind: "smart" },
  });
  if (!list) return { ok: false as const, error: "That list is gone" };

  await refreshSmartList(list);
  revalidateLists();
  return { ok: true as const };
}

/* ==========================================================================
 * The live preview
 * ======================================================================== */

export type PreviewResult = {
  items: NormalisedItem[];
  /**
   * Genres the user picked that TMDB has no television equivalent for. When
   * this is non-empty and shows were asked for, the shows half of the query was
   * dropped — the editor says so rather than letting the results look broken.
   */
  genresWithoutTv: string[];
};

/** How many the editor shows while you are still deciding. */
const PREVIEW_SIZE = 20;

/**
 * The next slice of a smart list, past the sixty that were cached.
 *
 * Only the first `SMART_LIST_SIZE` titles are stored, because a smart list is a
 * cache of an answer rather than a membership roll — storing two hundred rows
 * per list, rewritten nightly, to serve the handful of people who scroll past
 * the first screen would be the wrong trade. So scrolling past the cache re-runs
 * the query a little deeper and takes what is new.
 *
 * Re-running from the top each time looks wasteful and mostly is not: the pages
 * already walked come back from the TMDB fetch cache, so the only real cost is
 * the one new page at the end. It buys the thing that matters — the deeper run
 * is the *same* query, so item 61 is genuinely the next one, not the first item
 * of a differently-sorted second opinion.
 *
 * Three things stop this from being an open-ended crawl, and they are all here
 * rather than in the browser, because the browser is not the part to trust:
 * the offset is clamped, the total is capped at `SMART_LIST_MAX`, and a short
 * answer reports `done` so the caller stops asking.
 */
export async function loadMoreSmartList(input: { listId: string; offset: number }): Promise<{
  items: NormalisedItem[];
  done: boolean;
}> {
  const user = await requireUser();

  const list = await db.mediaList.findFirst({
    where: { id: input.listId, userId: user.id, kind: "smart" },
    select: { filters: true },
  });
  if (!list) return { items: [], done: true };

  // Whatever the caller claims, this only ever reads inside the window.
  const offset = Math.min(Math.max(0, Math.floor(input.offset) || 0), SMART_LIST_MAX);
  if (offset >= SMART_LIST_MAX) return { items: [], done: true };

  const filters = parseFilters(list.filters);
  const viewer =
    filters.hideWatched || filters.hideSaved ? await getViewerState(user.id) : undefined;

  const wanted = Math.min(offset + SMART_LIST_STEP, SMART_LIST_MAX);
  const all = await runSmartList(filters, wanted, viewer).catch(() => []);
  const items = all.slice(offset);

  return {
    items,
    // Either TMDB has run out — a run that came back short will not get longer
    // by being asked again — or we have reached the ceiling.
    done: items.length < SMART_LIST_STEP || offset + items.length >= SMART_LIST_MAX,
  };
}

/**
 * Runs the filters as they currently stand and returns the first twenty.
 *
 * This is the same call the saved list makes, only shallower — which is the
 * point: what the editor shows has to be the top of what the list will hold,
 * or the preview is a lie. It takes no list id because it deliberately works
 * before anything has been created.
 */
export async function previewSmartList(rawFilters: unknown): Promise<PreviewResult> {
  const user = await requireUser();
  const filters = parseFilters(rawFilters);

  const viewer =
    filters.hideWatched || filters.hideSaved ? await getViewerState(user.id) : undefined;

  const items = await runSmartList(filters, PREVIEW_SIZE, viewer).catch(() => []);

  return {
    items,
    genresWithoutTv: filters.kind === "movie" ? [] : genresWithoutTv(filters),
  };
}
