"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "./auth";
import { db } from "./db";
import { clearFailures, recordFailure, retryIn } from "./rate-limit";

export type SignInState = { error?: string; email?: string };

/**
 * Compared against when the address is unknown, so a miss costs a bcrypt round
 * like a hit does. Without it the timing difference answers "does this person
 * have an account here?". Made on first use, never checked in.
 */
let dummyHash: string | null = null;
function timingHash() {
  dummyHash ??= bcrypt.hashSync("trekker-timing-equaliser", 10);
  return dummyHash;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@")) return { error: "Enter your email address", email };
  if (!password) return { error: "Enter your password", email };

  const key = `sign-in:${email}`;
  const wait = retryIn(key);
  if (wait > 0) {
    return { error: `Too many attempts. Try again in ${Math.ceil(wait / 60_000)} min.`, email };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, tokenVersion: true },
  });

  // Accounts made through Plex have no password of their own to check.
  if (user && !user.passwordHash) return { error: "This account signs in with Plex.", email };

  const ok = user?.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, timingHash()).then(() => false);

  if (!ok || !user) {
    recordFailure(key);
    return { error: "Email or password is incorrect", email };
  }

  clearFailures(key);
  await createSession(user.id, user.tokenVersion);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

