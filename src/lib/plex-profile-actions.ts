"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "./auth";
import { db } from "./db";
import { chooseHomeProfile } from "./plex-accounts";
import { endHandoff, HANDOFF_COOKIE } from "./plex-handoff";

/*
 * The Plex Home picker's two answers. The form sends a profile's id and,
 * for a protected one, its PIN; the owner's token they are exchanged against
 * never leaves the server (`plex-handoff.ts`).
 */

export type ChoiceState = { error?: string };

export async function chooseProfile(_prev: ChoiceState, form: FormData): Promise<ChoiceState> {
  const jar = await cookies();
  const handle = jar.get(HANDOFF_COOKIE)?.value;
  // A face submits as `profile`; the PIN form sends the face chosen before it as `chosen`.
  const profileId = String(form.get("profile") || form.get("chosen") || "").slice(0, 64);
  const pin = String(form.get("pin") ?? "").trim().slice(0, 12);

  const outcome = await chooseHomeProfile(handle, profileId, pin);
  if (!outcome.ok) return { error: outcome.error };

  jar.delete(HANDOFF_COOKIE);
  const user = await db.user.findUnique({ where: { id: outcome.userId }, select: { tokenVersion: true } });
  await createSession(outcome.userId, user?.tokenVersion ?? 0);
  redirect("/");
}

/** Abandons the choice: the handoff is spent and the sign-in starts again. */
export async function cancelProfileChoice() {
  const jar = await cookies();
  endHandoff(jar.get(HANDOFF_COOKIE)?.value);
  jar.delete(HANDOFF_COOKIE);
  redirect("/login");
}
