"use server";

import { refresh, updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import { addOwnFeed, removeOwnFeed, setOwnFeedEnabled, setReadingPref, setSourceEnabled, type AddFeedOutcome, type ReadingPref } from "./news-settings";
import { bellTag } from "./notifications";
import { setNotify } from "./settings";
import type { SaveOutcome } from "./settings-actions";

/*
 * Settings › News's writes (Round 10), each checked in `lib/news-settings.ts`.
 * The controls are optimistic and save as they change; a write that fails
 * says so and the control goes back.
 *
 * Every write that lands then expires this person's bell, whose cached answer
 * carries the account row the chrome reads for a minute, and refreshes the
 * router, so Settings drawn again (a reload, the back button) and the News
 * page show what was just saved rather than what the caches held (second
 * review: a reload drew a switch just turned off as on).
 */

async function signedIn() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

/** Runs a write, and on success makes every page that reads it read again. */
async function attempt(userId: string, write: () => Promise<unknown>): Promise<SaveOutcome> {
  try {
    await write();
  } catch {
    return { ok: false, error: "That did not save. Try again in a moment." };
  }
  invalidate(userId);
  return { ok: true };
}

function invalidate(userId: string) {
  updateTag(bellTag(userId));
  refresh();
}

export async function saveNewsSource(name: string, enabled: boolean): Promise<SaveOutcome> {
  const user = await signedIn();
  return attempt(user.id, () => setSourceEnabled(user.id, name, enabled));
}

/** Reads the address once, while the person waits for their own feed; see `addOwnFeed`. */
export async function addNewsFeed(address: string): Promise<AddFeedOutcome> {
  const user = await signedIn();
  const outcome = await addOwnFeed(user.id, address).catch(() => ({ ok: false as const, error: "That did not save. Try again in a moment." }));
  if (outcome.ok) invalidate(user.id);
  return outcome;
}

export async function saveNewsFeed(id: string, enabled: boolean): Promise<SaveOutcome> {
  const user = await signedIn();
  return attempt(user.id, () => setOwnFeedEnabled(user.id, id, enabled));
}

export async function deleteNewsFeed(id: string): Promise<SaveOutcome> {
  const user = await signedIn();
  return attempt(user.id, () => removeOwnFeed(user.id, id));
}

/** Push me the big ones ("news") and New work from people you follow ("news-people"). */
export async function saveNewsPush(topic: "news" | "news-people", on: boolean): Promise<SaveOutcome> {
  const user = await signedIn();
  if (topic !== "news" && topic !== "news-people") return { ok: false, error: "That did not save. Try again in a moment." };
  return attempt(user.id, () => setNotify(user.id, topic, on === true));
}

/** A Reading row: which chip News opens on, marking read on opening, how long stories show. */
export async function saveNewsReading(key: ReadingPref, value: string | number | boolean): Promise<SaveOutcome> {
  const user = await signedIn();
  return attempt(user.id, () => setReadingPref(user.id, key, value));
}
