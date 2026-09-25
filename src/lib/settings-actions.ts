"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh, updateTag } from "next/cache";
import { takeBack } from "./admin";
import { destroySession, getCurrentUser } from "./auth";
import {
  BACKGROUND_COOKIE,
  BACKGROUND_COOKIE_MAX_AGE,
  backgroundCookieValue,
  type Background,
  type BackgroundVariant,
} from "./background";
import { dailyPoster } from "./background-art";
import { todayKey } from "./dates";
import { bellTag } from "./notifications";
import {
  deleteAccount,
  setNotify,
  setRegion,
  setScreensaverIdle,
  setBackground,
  setServices,
  type DeleteOutcome,
  type NotifyTopic,
} from "./settings";

/*
 * Settings' writes. Each is one column on the signed-in account, checked in
 * `lib/settings.ts`; the controls are optimistic, so a write re-renders the
 * page only where something else on it follows from the answer.
 */

export type SaveOutcome = { ok: true } | { ok: false; error: string };

async function signedIn() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

async function attempt(write: () => Promise<unknown>): Promise<SaveOutcome> {
  try {
    await write();
    return { ok: true };
  } catch {
    return { ok: false, error: "That did not save. Try again in a moment." };
  }
}

export async function saveServices(ids: number[]): Promise<SaveOutcome> {
  const user = await signedIn();
  return attempt(() => setServices(user.id, ids));
}

/** The chips are the region's services, so a new region re-renders them. */
export async function saveRegion(code: string | null): Promise<SaveOutcome> {
  const user = await signedIn();
  const outcome = await attempt(() => setRegion(user.id, code));
  if (outcome.ok) refresh();
  return outcome;
}

/** The chrome's idle watcher reads the minutes from the bell's answer, so that is expired too. */
export async function saveScreensaverIdle(minutes: number): Promise<SaveOutcome> {
  const user = await signedIn();
  const outcome = await attempt(() => setScreensaverIdle(user.id, minutes));
  if (outcome.ok) updateTag(bellTag(user.id));
  return outcome;
}

/**
 * The background: the row, then its cookie on this browser, so the next
 * paint (and the boot script before it) draws it; other devices take it
 * from the bell's answer, which is expired here. The artwork's poster for
 * today comes back with it, for the picker to put up at once.
 */
export async function saveBackground(
  variant: BackgroundVariant,
  hue: number,
): Promise<SaveOutcome & { poster?: string | null }> {
  const user = await signedIn();
  let saved: Background;
  try {
    saved = await setBackground(user.id, variant, hue);
  } catch {
    return { ok: false, error: "That did not save. Try again in a moment." };
  }
  const jar = await cookies();
  jar.set(BACKGROUND_COOKIE, backgroundCookieValue(saved), {
    path: "/",
    maxAge: BACKGROUND_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  updateTag(bellTag(user.id));
  const poster = saved.variant === "artwork" ? await dailyPoster(user.id, todayKey()).catch(() => null) : null;
  return { ok: true, poster };
}

export async function saveNotify(topic: NotifyTopic, on: boolean): Promise<SaveOutcome> {
  const user = await signedIn();
  return attempt(() => setNotify(user.id, topic, Boolean(on)));
}

/**
 * Deletes the signed-in account, then its session. The browser has already
 * told the worker to forget cached pages, so the next launch cannot paint the
 * deleted person's Home.
 */
export async function deleteMyAccount(typed: string): Promise<DeleteOutcome> {
  const user = await signedIn();
  const outcome = await deleteAccount(user.id, typed);
  if (!outcome.ok) return outcome;
  await destroySession();
  redirect("/login");
}

/** Admin only; `takeBack` checks. The owner's bell loses the badge's notice with it. */
export async function takeBackBadge(form: FormData): Promise<void> {
  const user = await signedIn();
  const target = String(form.get("userId") ?? "");
  const key = String(form.get("key") ?? "");
  if (!target || !key || target.length > 64 || key.length > 120) return;
  if (await takeBack(user.id, target, key)) {
    updateTag(bellTag(target));
    refresh();
  }
}
