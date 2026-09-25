"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "./auth";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import {
  addToList,
  cleanName,
  createManualList,
  deleteList,
  removeFromList,
  removeFromWatchlist,
  renameList,
  requestPlan,
  saveSmartList,
} from "./lists";
import { regionFor } from "./providers";
import { scheduleSmartBuild } from "./refresh";
import { mayRequest, requestOnSeerr, seerrConnected } from "./request";
import { wholeRuntime } from "./runtime";
import { parseFilters } from "./smart-filters";
import { PREVIEW_SIZE, runSmartList, SMART_LIST_SIZE, viewerSets } from "./smart-lists";
import { trendingNote, tvNote } from "./smart-query";
import { loadFilm, loadShow } from "./title";
import { setSaved } from "./title-writes";
import { searchMulti, searchPeople, tmdbConfigured, type MediaType } from "./tmdb";

/*
 * The lists section's writes, and the two things in it that ask TMDB while a
 * person waits: the smart list editor's preview and Add titles' search. Every
 * write re-renders the current page with `refresh()`; nothing cached hangs off
 * a list, so there is no tag to expire.
 */

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
const isMedia = (t: unknown): t is MediaType => t === "movie" || t === "tv";
const isListId = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9]{8,40}$/i.test(s);

/** A title's row fields from its details, read through the cache as a title page would. */
async function describe(mediaType: MediaType, tmdbId: number) {
  if (mediaType === "tv") {
    const show = await loadShow(tmdbId);
    if (!show) return null;
    const d = show.details;
    return {
      mediaType,
      tmdbId,
      title: d.name,
      poster: d.poster_path,
      score: Math.round(d.vote_average * 10) || null,
      year: d.first_air_date ? d.first_air_date.slice(0, 4) : null,
      runtime: wholeRuntime("tv", d),
    };
  }
  const film = await loadFilm(tmdbId);
  if (!film) return null;
  const d = film.details;
  return {
    mediaType,
    tmdbId,
    title: d.title,
    poster: d.poster_path,
    score: Math.round(d.vote_average * 10) || null,
    year: d.release_date ? d.release_date.slice(0, 4) : null,
    runtime: wholeRuntime("movie", d),
  };
}

// ---------------------------------------------------------------------------
// Manual lists

export async function createList(name: string): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out." };
  const clean = cleanName(name);
  if (!clean) return { error: "Give it a name." };
  const list = await createManualList(user.id, clean);
  refresh();
  return { id: list.id };
}

export async function renameListAction(listId: string, name: string): Promise<boolean> {
  const user = await getCurrentUser();
  const clean = cleanName(name);
  if (!user || !isListId(listId) || !clean) return false;
  const ok = await renameList(user.id, listId, clean);
  if (ok) refresh();
  return ok;
}

/** No refresh: the page it was on no longer exists, and the caller goes to /lists. */
export async function deleteListAction(listId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !isListId(listId)) return false;
  return deleteList(user.id, listId);
}

export async function removeFromListAction(listId: string, mediaType: MediaType, tmdbId: number) {
  const user = await getCurrentUser();
  if (!user || !isListId(listId) || !isMedia(mediaType) || !isId(tmdbId)) return;
  if (await removeFromList(user.id, listId, mediaType, tmdbId)) refresh();
}

export async function removeFromWatchlistAction(mediaType: MediaType, tmdbId: number) {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return;
  await removeFromWatchlist(user.id, mediaType, tmdbId);
  refresh();
}

export type SearchHit = {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  poster: string | null;
  year: string | null;
  onList: boolean;
};

/**
 * Add titles' search: TMDB's multi search through the cache (an hour's
 * lifetime), with what the list already holds marked. Two characters at
 * least, where a search stops being the whole catalogue.
 */
export async function searchForList(listId: string, query: string): Promise<SearchHit[]> {
  const user = await getCurrentUser();
  const term = typeof query === "string" ? query.trim().slice(0, 100) : "";
  if (!user || !isListId(listId) || term.length < 2 || !tmdbConfigured()) return [];
  const [found, held] = await Promise.all([
    searchMulti(term).catch(() => null),
    db.mediaListItem.findMany({ where: { listId, list: { userId: user.id } }, select: { mediaType: true, tmdbId: true } }),
  ]);
  const on = new Set(held.map((h) => `${h.mediaType}-${h.tmdbId}`));
  return (found?.items ?? []).slice(0, 12).map((i) => ({
    mediaType: i.mediaType,
    tmdbId: i.id,
    title: i.title,
    poster: i.poster,
    year: i.year,
    onList: on.has(`${i.mediaType}-${i.id}`),
  }));
}

export async function addTitleToList(listId: string, mediaType: MediaType, tmdbId: number): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !isListId(listId) || !isMedia(mediaType) || !isId(tmdbId)) return false;
  const item = await describe(mediaType, tmdbId).catch(() => null);
  if (!item) return false;
  const ok = await addToList(user.id, listId, item);
  if (ok) refresh();
  return ok;
}

/**
 * Save's menu on a title page: the watchlist or one manual list, on or off.
 * Filing only; lists are made on the lists page and nowhere else.
 */
export async function setSaveTarget(target: string, mediaType: MediaType, tmdbId: number, on: boolean) {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return;
  if (target === "watchlist") {
    const d = await describe(mediaType, tmdbId);
    if (!d) return;
    await setSaved(user.id, mediaType, tmdbId, on === true, d);
  } else if (isListId(target)) {
    if (on === true) {
      const d = await describe(mediaType, tmdbId);
      if (!d) return;
      await addToList(user.id, target, d);
    } else {
      await removeFromList(user.id, target, mediaType, tmdbId);
    }
  } else return;
  refresh();
}

// ---------------------------------------------------------------------------
// Smart lists

export type PreviewItem = { mediaType: MediaType; tmdbId: number; title: string; poster: string | null; score: number };

export type Preview = {
  items: PreviewItem[];
  /** How many a saved list would keep, up to sixty. */
  count: number;
  /** How many the question matches in all, which the preview reports (`matchTotal`). */
  total: number;
  /** False when TMDB could not answer, which is not the same as nothing matching. */
  ok: boolean;
  tvNote: string | null;
  trendingNote: string | null;
};

/**
 * The editor's live preview: the same run the saved list makes, at the same
 * depth, so the twenty shown are the top of what Save would store and the
 * count is what it would hold; the total is what the question matches beyond
 * that, which is what the editor shows. Through the cache, so going back to a question
 * already asked costs nothing.
 */
export async function previewSmartList(raw: unknown): Promise<Preview> {
  const user = await getCurrentUser();
  const f = parseFilters(raw);
  const notes = { tvNote: tvNote(f), trendingNote: trendingNote(f) };
  if (!user) return { items: [], count: 0, total: 0, ok: false, ...notes };
  const me = await db.user.findUnique({ where: { id: user.id }, select: { region: true } });
  const viewer = f.hideWatched || f.hideSaved ? await viewerSets(user.id) : undefined;
  const answer = await runSmartList(f, SMART_LIST_SIZE, { region: regionFor(me?.region), viewer });
  return {
    items: answer.items.slice(0, PREVIEW_SIZE).map((i) => ({
      mediaType: i.mediaType,
      tmdbId: i.id,
      title: i.title,
      poster: i.poster,
      score: i.score,
    })),
    count: answer.items.length,
    total: answer.total,
    ok: answer.ok,
    ...notes,
  };
}

export async function findPeople(query: string) {
  const user = await getCurrentUser();
  const term = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (!user || term.length < 2 || !tmdbConfigured()) return [];
  return (await searchPeople(term).catch(() => [])).slice(0, 8);
}

/**
 * Writes the list and queues its first build, which reads the answers the
 * preview has just put in the cache, so it lands in moments. The caller goes
 * to the list, whose "being built" line waits for it.
 */
export async function saveSmartListAction(
  listId: string | null,
  name: string,
  raw: unknown,
  autoRequest?: boolean,
): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Signed out." };
  const clean = cleanName(name);
  if (!clean) return { error: "Give it a name." };
  if (listId !== null && !isListId(listId)) return { error: "That list is gone." };
  // The switch is stored only where it was offered.
  const auto = typeof autoRequest === "boolean" && (await seerrConnected()) ? autoRequest : undefined;
  const id = await saveSmartList(user.id, listId, clean, JSON.stringify(parseFilters(raw)), auto);
  if (!id) return { error: "That list is gone." };
  void scheduleSmartBuild(id).catch((error) => console.error(`build of smart list ${id} failed`, error));
  return { id };
}

// ---------------------------------------------------------------------------
// Requesting what a smart list finds

export type RequestAllOutcome = { filed: number; failed: number; error: string | null };

/**
 * Request all: files an Overseerr request for each title the plan names,
 * leaving out those already streaming on a service this person pays for when
 * they chose to skip them. The plan is worked out again here rather than
 * trusted from the page. Two at a time through the Overseerr gate.
 */
export async function requestAllOnList(listId: string, skipSubscribed: boolean): Promise<RequestAllOutcome> {
  const user = await getCurrentUser();
  if (!user || !isListId(listId)) return { filed: 0, failed: 0, error: "Signed out." };
  if (!(await mayRequest(user.id))) {
    return { filed: 0, failed: 0, error: "Requesting is limited to people with access to this Plex server." };
  }
  const plan = await requestPlan(user.id, listId);
  if (!plan) return { filed: 0, failed: 0, error: "That list is gone." };
  const skip = new Set(skipSubscribed ? plan.subscribed.map((s) => `${s.mediaType}-${s.tmdbId}`) : []);
  const wanted = plan.titles.filter((t) => !skip.has(`${t.mediaType}-${t.tmdbId}`));
  const outcomes = await mapLimit(wanted, 2, (t) => requestOnSeerr(user.id, t.mediaType, t.tmdbId));
  const failed = outcomes.filter((o) => !o.ok);
  refresh();
  return {
    filed: outcomes.length - failed.length,
    failed: failed.length,
    error: failed.length ? (failed[0] as { error: string }).error : null,
  };
}
