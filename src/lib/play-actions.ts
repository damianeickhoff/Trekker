"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "./auth";
import { isDateKey, localMidday, todayKey } from "./dates";
import { db } from "./db";
import { markEpisodeFromHome } from "./home";
import { viewingChanged } from "./viewing";
import { redatePlay } from "./plays";
// Imported for its side effect: registering the hook that fetches a show the
// refresh job has never seen, in whichever bundle this action runs.
import "./refresh";

/*
 * Home's writes. Each one refreshes Home's own data and nothing else: the tag
 * for this person's play-derived rails, via `updateTag` (Next 16's
 * read-your-own-writes form of `revalidateTag`, which also re-renders the
 * current route with the answer), and their bell, through `viewingChanged`.
 * Never `revalidatePath("/", "layout")`, which would throw away every cached
 * answer on every tick.
 */

export type MarkResult = {
  /** The new viewing, which the "when?" menu may redate; null if nothing new was logged. */
  playId: string | null;
};

export async function markEpisodeWatched(
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<MarkResult | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const result = await markEpisodeFromHome(user.id, showId, seasonNumber, episodeNumber);
  if (!result) return null;
  viewingChanged(user.id);
  return { playId: result.created ? result.playId : null };
}

/**
 * "When did you watch it?": moves a viewing just logged to another day, at
 * midday. The day comes from the browser, which knows what "yesterday" means
 * where the person is; a day in the future is refused.
 */
export async function redateWatch(playId: string, day: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || typeof playId !== "string" || !isDateKey(day) || day > todayKey()) return false;
  // Only ever offered on Home, straight after a tick there, so it holds the place the tick held.
  const moved = await redatePlay(user.id, playId, localMidday(day), { holdPlace: true });
  if (moved) viewingChanged(user.id);
  return moved;
}

/**
 * Stops suggesting a show: the rows and the history stay, but Up next and the
 * calendar leave it out. Nothing cached depends on it, so the route is simply
 * re-rendered.
 */
export async function stopWatching(showId: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !Number.isInteger(showId)) return;
  const state = await db.titleState.findUnique({
    where: { userId_showId: { userId: user.id, showId } },
    select: { showName: true },
  });
  if (!state) return;
  await db.droppedShow.upsert({
    where: { userId_showId: { userId: user.id, showId } },
    create: { userId: user.id, showId, showName: state.showName },
    update: {},
  });
  refresh();
}
