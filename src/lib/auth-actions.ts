"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { createSession, destroySession, requireUser } from "./auth";
import { isAdmin } from "./admin";
import { checkLimit, clearLimit, describeWait, recordFailure } from "./rate-limit";

export type FormState = { error?: string };

/**
 * A real bcrypt hash of nothing in particular, compared against when the
 * address is unknown so that a miss takes as long as a hit. Generated once at
 * module load rather than checked in, so it is never a hash anybody has seen.
 */
const DUMMY_HASH = bcrypt.hashSync("trekker-timing-equaliser", 10);

const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials
    .extend({ name: z.string().min(1, "Tell us your name").max(60) })
    .safeParse({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "That email is already registered" };

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
  });

  await createSession(user.id);
  redirect("/");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const key = `login:${parsed.data.email}`;
  const gate = checkLimit(key);
  if (!gate.allowed) {
    return { error: `Too many attempts. Try again ${describeWait(gate.retryInMs)}.` };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // An account created through Plex has no password of its own to check.
  if (user && !user.passwordHash) {
    return { error: "That account signs in with Plex — use the Plex button below" };
  }

  /**
   * Compared against a throwaway hash when there is no such account, so a
   * miss costs the same as a hit. Without it this returns immediately for an
   * unknown address and a bcrypt round later for a known one — a timing
   * difference big enough to read over the network, which turns the login
   * form into a way to ask "does this person have an account here?".
   */
  const ok = user?.passwordHash
    ? await bcrypt.compare(parsed.data.password, user.passwordHash)
    : await bcrypt.compare(parsed.data.password, DUMMY_HASH).then(() => false);

  if (!ok) {
    recordFailure(key);
    return { error: "Email or password is incorrect" };
  }

  clearLimit(key);
  await createSession(user!.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/**
 * Closes the account and takes everything with it.
 *
 * Confirmation is the user typing their own address, checked against the
 * session rather than against anything the form supplied — a hidden field
 * holding the expected value would only be confirming the page to itself.
 *
 * There is no undo and no grace period: the cascade removes the play log, the
 * lists, the ratings and the friendships in one statement. The export offered
 * beside this in Settings is the whole of the safety net, which is why that
 * button came first.
 */
export async function deleteAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) {
    return { error: "Type your email address exactly to confirm" };
  }

  /**
   * The instance's Plex and Overseerr connections live on the *oldest*
   * account, and `getAdmin()` resolves that by date — so deleting it does not
   * just remove one user, it silently hands ownership of the server
   * configuration to whoever signed up second, while the credentials
   * themselves go in the cascade. Nobody expects "delete my account" to mean
   * "disconnect Plex for the household".
   */
  if (await isAdmin(user.id)) {
    const others = await db.user.count({ where: { id: { not: user.id } } });
    if (others > 0) {
      return {
        error:
          "This account owns the instance's Plex and Overseerr settings. Remove the other accounts first, or hand the instance over, before closing it.",
      };
    }
  }

  await db.user.delete({ where: { id: user.id } });
  await destroySession();
  redirect("/register");
}

/**
 * Changing the password, and signing every other device out with it.
 *
 * The current password is checked even though the caller is already
 * authenticated: a session left open on a shared machine should not be enough
 * to lock the owner out of their own account. A Plex-linked account has no
 * password to check, so for those this *sets* one — they are already
 * authenticated by Plex, and there is nothing to prove.
 */
export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, plexManaged: true },
  });
  if (!account) return { error: "Account not found" };

  // A managed Plex Home profile has a placeholder address and is meant to be
  // reached through the household, never signed into directly.
  if (account.plexManaged) {
    return { error: "Managed Plex profiles sign in through the main account" };
  }

  const next = String(formData.get("password") ?? "");
  const parsed = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .safeParse(next);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (account.passwordHash) {
    const current = String(formData.get("current") ?? "");
    if (!(await bcrypt.compare(current, account.passwordHash))) {
      return { error: "That is not your current password" };
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data, 10),
      // Everything signed with the old version stops working.
      tokenVersion: { increment: 1 },
    },
  });

  // ...including this tab, so it is handed a new one straight away. Without
  // this the user changes their password and is immediately signed out, which
  // reads as the change having failed.
  await createSession(user.id);
  return { error: undefined };
}

/**
 * Ends every session, this one included.
 *
 * The honest answer to "I left it signed in somewhere". Bumping the version is
 * all it takes — nothing has to find the other devices, because none of their
 * tokens will verify against the new number.
 */
export async function signOutEverywhere() {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { tokenVersion: { increment: 1 } },
  });

  await destroySession();
  redirect("/login");
}
