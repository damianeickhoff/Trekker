import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { authSecretBytes } from "./secrets";
import { SESSION_COOKIE, SESSION_MAX_AGE, isCurrent, signSession, verifySession } from "./session";

/**
 * A `Secure` cookie is dropped by browsers over plain HTTP, which is how a
 * self-hosted instance on a LAN address is normally reached. Keying off the
 * request's own protocol keeps that working while hardening real HTTPS.
 */
async function isHttps() {
  const h = await headers();
  return (
    h.get("x-forwarded-proto")?.split(",")[0].trim() === "https" ||
    h.get("origin")?.startsWith("https://") === true
  );
}

export async function createSession(userId: string, tokenVersion: number) {
  const token = await signSession({ userId, tokenVersion }, authSecretBytes());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * The same cookie as `createSession`, for a route handler that answers with
 * a redirect of its own (the Plex sign-in's return leg) and sets it there.
 */
export async function sessionCookie(userId: string, tokenVersion: number, secure: boolean) {
  return {
    name: SESSION_COOKIE,
    value: await signSession({ userId, tokenVersion }, authSecretBytes()),
    options: { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: SESSION_MAX_AGE },
  };
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * The cookie, verified by signature only. No database read, which is why the
 * proxy and layouts can afford it on every request. It does not see a revoked
 * session; `getCurrentUser` does.
 */
export const getSession = cache(async () => {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value, authSecretBytes());
});

/**
 * The signed-in user, checked against the row so a revoked token is refused.
 * For loaders that are about to read that user's data anyway; never for chrome.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, tokenVersion: true },
  });
  if (!user || !isCurrent(session, user.tokenVersion)) return null;
  return user;
});
