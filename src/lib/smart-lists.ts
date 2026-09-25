import "server-only";
import { mapLimit } from "./concurrency";
import { todayKey } from "./dates";
import { db } from "./db";
import { regionFor } from "./providers";
import { wholeRuntime } from "./runtime";
import { parseFilters, type SmartFilters } from "./smart-filters";
import { discoverParams, filterTrending, leaveOut, matchTotal, type Found, type ViewerSets } from "./smart-query";
import { discover, getMovieDetails, getTrending, getTvDetails, tmdbConfigured, type MediaType } from "./tmdb";

/**
 * Answering a smart list. The same function serves the editor's preview and
 * the daily rebuild, on purpose: a preview that ran a different query from the
 * one that gets saved would be a preview of nothing. Everything else that
 * reads a smart list reads its `MediaListItem` rows.
 */

/** How many titles a saved smart list keeps. */
export const SMART_LIST_SIZE = 60;

/** What the editor shows of it. */
export const PREVIEW_SIZE = 20;

const PAGE_SIZE = 20;
/** However deep a run is asked to go, it stops here: the backstop on TMDB's five hundred pages. */
const MAX_PAGES = 8;

/**
 * Two pages more than the arithmetic needs, and as deep as the backstop when a
 * leave-out toggle is on: someone who has seen half of the popular horror
 * films throws away half of every page, and stopping early would hand back
 * less than was asked for and call it the end. The run stops as soon as it
 * has enough, so the depth only costs anything when it is needed.
 */
function pagesFor(limit: number, leavingOut: boolean) {
  return leavingOut ? MAX_PAGES : Math.min(MAX_PAGES, Math.ceil(limit / PAGE_SIZE) + 2);
}

/** Seen at all (a film watched, a show begun) and filed anywhere by hand. */
export async function viewerSets(userId: string): Promise<ViewerSets> {
  const [films, shows, watchlist, favourites, listed] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId }, select: { movieId: true } }),
    db.watchedEpisode.findMany({ where: { userId }, select: { showId: true }, distinct: ["showId"] }),
    db.watchlistItem.findMany({ where: { userId }, select: { mediaType: true, tmdbId: true } }),
    db.favourite.findMany({ where: { userId }, select: { mediaType: true, tmdbId: true } }),
    db.mediaListItem.findMany({ where: { list: { userId, kind: "manual" } }, select: { mediaType: true, tmdbId: true } }),
  ]);
  const watched = new Set<string>([...films.map((f) => `movie-${f.movieId}`), ...shows.map((s) => `tv-${s.showId}`)]);
  const saved = new Set<string>([...watchlist, ...favourites, ...listed].map((r) => `${r.mediaType}-${r.tmdbId}`));
  return { watched, saved };
}

export type SmartAnswer = {
  items: Found[];
  /** How many the question matches in all, beyond `limit` (see `matchTotal`). The preview's count. */
  total: number;
  /** False when every request failed: an outage, not an empty answer. */
  ok: boolean;
};

const NOBODY: ViewerSets = { watched: new Set(), saved: new Set() };

/**
 * Runs the filters and returns up to `limit` titles, best first. Pages are
 * fetched a round at a time and the run stops as soon as there is enough, so
 * an unnarrowed list costs one request per medium; all of it is read through
 * the cache, so the editor re-asking the same question is free.
 */
export async function runSmartList(
  f: SmartFilters,
  limit: number,
  context: { region: string; today?: string; viewer?: ViewerSets },
): Promise<SmartAnswer> {
  if (!tmdbConfigured()) return { items: [], total: 0, ok: false };
  const viewer = context.viewer ?? NOBODY;
  const today = context.today ?? todayKey();

  if (f.source === "trending") {
    const scope = f.kind === "both" ? "all" : f.kind;
    // The daily ranking overlaps the weekly one; it is there to give a narrow
    // filter more than twenty rows to work with.
    const [week, day] = await Promise.all([
      getTrending(scope, "week").catch(() => null),
      getTrending(scope, "day").catch(() => null),
    ]);
    if (!week && !day) return { items: [], total: 0, ok: false };
    // The ranking is read whole, so what survives the filters is the exact total.
    const kept = leaveOut(filterTrending([...(week ?? []), ...(day ?? [])], f), f, viewer);
    return { items: kept.slice(0, limit), total: kept.length, ok: true };
  }

  const halves = (["movie", "tv"] as const)
    .map((mediaType) => ({ mediaType, params: discoverParams(f, mediaType, { region: context.region, today }) }))
    .filter((h): h is { mediaType: MediaType; params: Record<string, string> } => h.params !== null);
  if (halves.length === 0) return { items: [], total: 0, ok: true };

  const collected: Found[] = [];
  // Each half's latest `total_results`, for the preview's count.
  const reported = new Map<MediaType, number>();
  let answered = false;
  let exhausted = false;
  const total = (kept: number) => matchTotal({ reported: [...reported.values()], fetched: collected.length, kept, exhausted });
  const depth = pagesFor(limit, f.hideWatched || f.hideSaved);
  for (let page = 1; page <= depth; page++) {
    const rounds = await Promise.all(
      halves.map((h) => discover(h.mediaType, { ...h.params, page }).catch(() => null)),
    );
    if (rounds.some(Boolean)) answered = true;
    rounds.forEach((r, i) => r && reported.set(halves[i].mediaType, r.totalResults));
    // Interleaved, so a "both" list is not all the films and then all the shows.
    const lists = rounds.map((r) => r?.items ?? []);
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) collected.push(l[i]);

    exhausted = rounds.every((r) => !r || r.page >= r.totalPages);
    const kept = leaveOut(collected, f, viewer);
    if (kept.length >= limit) return { items: kept.slice(0, limit), total: total(kept.length), ok: true };
    if (exhausted) break;
  }
  const kept = leaveOut(collected, f, viewer);
  return { items: kept.slice(0, limit), total: total(kept.length), ok: answered };
}

/**
 * Rebuilds one smart list's rows from its filters. The set is thrown away and
 * rewritten rather than reconciled: nothing is "on" a smart list in a way that
 * outlives the question, and position is TMDB's ranking. Lengths already known
 * for a title (on this list yesterday, or on any other) are carried over, so
 * the daily top-up only asks about what is new.
 *
 * An outage leaves yesterday's answer and its stamp alone, so the list is
 * tried again tomorrow rather than emptied today. A question that genuinely
 * matches nothing is stamped like any other.
 *
 * `added` is what this build found that the last one did not, for
 * auto-request. Only against a build of the same question: a list never built,
 * or edited since (both leave `refreshedAt` null), is drawing its first line,
 * and everything on it would otherwise count as new.
 */
export async function rebuildSmartList(listId: string): Promise<{ count: number; ok: boolean; added: Found[] }> {
  const list = await db.mediaList.findUnique({
    where: { id: listId },
    select: {
      id: true,
      kind: true,
      filters: true,
      userId: true,
      refreshedAt: true,
      user: { select: { region: true } },
      items: { select: { mediaType: true, tmdbId: true } },
    },
  });
  if (!list || list.kind !== "smart") return { count: 0, ok: false, added: [] };

  const f = parseFilters(list.filters);
  const viewer = f.hideWatched || f.hideSaved ? await viewerSets(list.userId) : undefined;
  const answer = await runSmartList(f, SMART_LIST_SIZE, { region: regionFor(list.user.region), viewer });
  if (!answer.ok) return { count: 0, ok: false, added: [] };

  const known = await knownRuntimes(answer.items);
  await db.$transaction([
    db.mediaListItem.deleteMany({ where: { listId } }),
    db.mediaListItem.createMany({
      data: answer.items.map((item, position) => ({
        listId,
        mediaType: item.mediaType,
        tmdbId: item.id,
        title: item.title,
        poster: item.poster,
        score: item.score || null,
        year: item.year,
        runtime: known.get(`${item.mediaType}-${item.id}`) ?? null,
        position,
      })),
    }),
    db.mediaList.update({ where: { id: listId }, data: { refreshedAt: new Date() } }),
  ]);
  const before = new Set(list.items.map((i) => `${i.mediaType}-${i.tmdbId}`));
  const added = list.refreshedAt ? answer.items.filter((i) => !before.has(`${i.mediaType}-${i.id}`)) : [];
  return { count: answer.items.length, ok: true, added };
}

async function knownRuntimes(items: Found[]) {
  const out = new Map<string, number>();
  if (!items.length) return out;
  const rows = await db.mediaListItem.findMany({
    where: {
      runtime: { not: null },
      OR: (["movie", "tv"] as const)
        .map((t) => ({ mediaType: t, tmdbId: { in: items.filter((i) => i.mediaType === t).map((i) => i.id) } }))
        .filter((w) => w.tmdbId.in.length),
    },
    select: { mediaType: true, tmdbId: true, runtime: true },
  });
  for (const r of rows) out.set(`${r.mediaType}-${r.tmdbId}`, r.runtime!);
  return out;
}

/** How many titles one daily pass looks up lengths for. Details keep a week, so repeats are cache hits. */
export const RUNTIME_TOP_UP = 120;

/**
 * Lengths for list rows that have none, through the cached details: one lookup
 * per title however many lists hold it. `schedule` is the refresh queue in the
 * app and a plain call in tests.
 */
export async function topUpListRuntimes(
  schedule: <T>(key: string, task: () => Promise<T>) => Promise<T> = (_key, task) => task(),
  cap = RUNTIME_TOP_UP,
) {
  if (!tmdbConfigured()) return { titles: 0, filled: 0 };
  const rows = await db.mediaListItem.findMany({
    where: { runtime: null },
    select: { mediaType: true, tmdbId: true },
    distinct: ["mediaType", "tmdbId"],
    orderBy: { addedAt: "desc" },
    take: cap,
  });
  const results = await mapLimit(rows, 4, async (row) => {
    const mediaType = row.mediaType === "tv" ? "tv" : "movie";
    const minutes = await schedule(`runtime:${mediaType}-${row.tmdbId}`, async () => {
      const d = mediaType === "tv" ? await getTvDetails(row.tmdbId).catch(() => null) : await getMovieDetails(row.tmdbId).catch(() => null);
      return wholeRuntime(mediaType, d);
    }).catch(() => null);
    if (minutes === null) return false;
    await db.mediaListItem.updateMany({ where: { mediaType, tmdbId: row.tmdbId }, data: { runtime: minutes } });
    return true;
  });
  return { titles: rows.length, filled: results.filter(Boolean).length };
}
