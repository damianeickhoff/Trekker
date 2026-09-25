"use server";

import { refresh, updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import { isDateKey, localMidday, todayKey } from "./dates";
import { viewingChanged } from "./viewing";
import { redatePlay, removePlay } from "./plays";
import { bellTag } from "./notifications";
import { sendToUser } from "./push";
import { recommendTargets, recommendTitle, type RecommendOutcome, type RecommendTarget } from "./recommend";
import { requestOnSeerr, type RequestOutcome } from "./request";
import { loadFilm, loadShow } from "./title";
import {
  addComment,
  deleteComment,
  markEpisode,
  markFilm,
  markSeason,
  setDropped,
  setEpisodeRating,
  setFavourite,
  setFeeling,
  setRating,
  setSaved,
  unmarkEpisode,
} from "./title-writes";
// Imported for its side effect: registering the hook that fetches a show the
// refresh job has never seen, in whichever bundle this action runs.
import "./refresh";

/*
 * The title, episode and film pages' writes. A viewing expires this person's
 * play tag with `updateTag` (through `viewingChanged`, which also expires the
 * bell and looks for a badge reached), which is what Home's cached rails hang
 * off and which also re-renders the current page from the new rows; everything else
 * re-renders the current page with `refresh()`, because nothing cached depends
 * on it. Never a layout revalidation.
 */

const isId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
const isIndex = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
const isMedia = (t: unknown): t is "movie" | "tv" => t === "movie" || t === "tv";

async function describe(mediaType: "movie" | "tv", tmdbId: number) {
  if (mediaType === "tv") {
    const show = await loadShow(tmdbId);
    return show
      ? { title: show.details.name, poster: show.details.poster_path, score: Math.round(show.details.vote_average * 10) || null }
      : null;
  }
  const film = await loadFilm(tmdbId);
  return film
    ? { title: film.details.title, poster: film.details.poster_path, score: Math.round(film.details.vote_average * 10) || null }
    : null;
}

export type MarkResult = { playId: string | null } | null;

export async function markEpisodeWatched(showId: number, season: number, episode: number): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user || !isId(showId) || !isIndex(season) || !isId(episode)) return null;
  const result = await markEpisode(user.id, showId, season, episode);
  if (!result) return null;
  viewingChanged(user.id);
  return { playId: result.created ? result.playId : null };
}

export async function unmarkEpisodeWatched(showId: number, season: number, episode: number): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !isId(showId) || !isIndex(season) || !isId(episode)) return false;
  await unmarkEpisode(user.id, showId, season, episode);
  viewingChanged(user.id);
  return true;
}

export async function markSeasonWatched(showId: number, season: number): Promise<number> {
  const user = await getCurrentUser();
  if (!user || !isId(showId) || !isIndex(season)) return 0;
  const logged = await markSeason(user.id, showId, season);
  viewingChanged(user.id);
  return logged;
}

export async function markFilmWatched(movieId: number): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user || !isId(movieId)) return null;
  const film = await loadFilm(movieId);
  if (!film) return null;
  const today = todayKey();
  // Not before it is out anywhere: a stale page cannot log the future.
  if (film.details.release_date && film.details.release_date > today) return null;
  const result = await markFilm(user.id, film.details);
  viewingChanged(user.id);
  return { playId: result.created ? result.playId : null };
}

/** Undoes the latest viewing only; years of rewatches are not a fat finger's to erase. */
export async function removeLastViewing(
  target: { mediaType: "movie" | "tv"; tmdbId: number; season?: number; episode?: number },
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !isMedia(target.mediaType) || !isId(target.tmdbId)) return false;
  await removePlay(user.id, {
    mediaType: target.mediaType,
    tmdbId: target.tmdbId,
    seasonNumber: target.season ?? null,
    episodeNumber: target.episode ?? null,
  });
  viewingChanged(user.id);
  return true;
}

/** "When did you watch it?" from a title page: unlike Home's, it reorders Up next. */
export async function redateFromTitle(playId: string, day: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || typeof playId !== "string" || !isDateKey(day) || day > todayKey()) return false;
  const moved = await redatePlay(user.id, playId, localMidday(day));
  if (moved) viewingChanged(user.id);
  return moved;
}

export async function rateTitle(mediaType: "movie" | "tv", tmdbId: number, score: number | null): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return false;
  const d = await describe(mediaType, tmdbId);
  if (!d) return false;
  const ok = await setRating(user.id, mediaType, tmdbId, score, d);
  if (ok) refresh();
  return ok;
}

export async function rateEpisode(showId: number, season: number, episode: number, score: number | null) {
  const user = await getCurrentUser();
  if (!user || !isId(showId) || !isIndex(season) || !isId(episode)) return false;
  const ok = await setEpisodeRating(user.id, showId, season, episode, score);
  if (ok) refresh();
  return ok;
}

export async function setFavourited(mediaType: "movie" | "tv", tmdbId: number, on: boolean) {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return;
  const d = await describe(mediaType, tmdbId);
  if (!d) return;
  await setFavourite(user.id, mediaType, tmdbId, on === true, d);
  refresh();
}

export async function setOnWatchlist(mediaType: "movie" | "tv", tmdbId: number, on: boolean) {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return;
  const d = await describe(mediaType, tmdbId);
  if (!d) return;
  await setSaved(user.id, mediaType, tmdbId, on === true, d);
  refresh();
}

export async function setStopWatching(showId: number, dropped: boolean) {
  const user = await getCurrentUser();
  if (!user || !isId(showId)) return;
  const d = await describe("tv", showId);
  await setDropped(user.id, showId, d?.title ?? "Untitled", dropped === true);
  refresh();
}

export async function chooseFeeling(
  mediaType: "movie" | "tv",
  tmdbId: number,
  season: number,
  episode: number,
  feeling: string | null,
) {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId) || !isIndex(season) || !isIndex(episode)) return false;
  const ok = await setFeeling(user.id, mediaType, tmdbId, season, episode, feeling);
  if (ok) refresh();
  return ok;
}

export async function postComment(mediaType: "movie" | "tv", tmdbId: number, body: string) {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId) || typeof body !== "string") return false;
  const made = await addComment(user.id, mediaType, tmdbId, body);
  if (made) refresh();
  return Boolean(made);
}

export async function removeComment(id: string) {
  const user = await getCurrentUser();
  if (!user || typeof id !== "string") return false;
  const ok = await deleteComment(user.id, id);
  if (ok) refresh();
  return ok;
}

export async function requestTitle(mediaType: "movie" | "tv", tmdbId: number): Promise<RequestOutcome> {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return { ok: false, error: "Not signed in." };
  const outcome = await requestOnSeerr(user.id, mediaType, tmdbId);
  if (outcome.ok) refresh();
  return outcome;
}

/** Friends to offer in the Recommend sheet, read when it opens rather than with every title page. */
export async function recommendTargetsFor(mediaType: "movie" | "tv", tmdbId: number): Promise<RecommendTarget[]> {
  const user = await getCurrentUser();
  if (!user || !isMedia(mediaType) || !isId(tmdbId)) return [];
  return recommendTargets(user.id, mediaType, tmdbId);
}

/**
 * Sends a title to one friend. The name and poster come from the details the
 * page was drawn from, never from the browser. It lands in their bell, whose
 * cached answer is expired so it shows on their next look, and is pushed to
 * their devices in the bell's own words; a push service's failure is never
 * the button's.
 */
export async function recommendTo(toUserId: string, mediaType: "movie" | "tv", tmdbId: number): Promise<RecommendOutcome> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (typeof toUserId !== "string" || !toUserId || toUserId.length > 64 || !isMedia(mediaType) || !isId(tmdbId)) {
    return { ok: false, error: "That does not look right" };
  }
  const d = await describe(mediaType, tmdbId);
  if (!d) return { ok: false, error: "That title could not be found" };
  const outcome = await recommendTitle(user.id, toUserId, { mediaType, tmdbId, title: d.title, poster: d.poster });
  if (!outcome.ok) return outcome;
  updateTag(bellTag(toUserId));
  await sendToUser(toUserId, {
    title: `${user.name} recommends ${d.title}`,
    body: "Tap to see what it is",
    url: `/title/${mediaType}/${tmdbId}`,
    tag: `rec:${user.id}:${mediaType}:${tmdbId}`,
  }, "friends").catch(() => undefined);
  return outcome;
}
