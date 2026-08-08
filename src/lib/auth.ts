import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "./db";
import { authSecretBytes } from "./secrets";

const COOKIE = "trekker_session";

/**
 * A `Secure` cookie is dropped outright by browsers over plain HTTP, which is
 * how a self-hosted instance on a LAN address is normally reached. Keying this
 * off the actual request protocol rather than NODE_ENV keeps a production build
 * usable on the local network while still hardening a real HTTPS deployment.
 */
async function isHttps() {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-proto")?.split(",")[0].trim() === "https" ||
    headerList.get("origin")?.startsWith("https://") === true
  );
}

export async function createSession(userId: string) {
  // Stamped into the token so it can be compared on every read. See
  // `User.tokenVersion` — this is the whole of session revocation.
  const account = await db.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });

  const token = await new SignJWT({ sub: userId, v: account?.tokenVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(authSecretBytes());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Returns the signed-in user, or null. Memoised per request. */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, authSecretBytes());
    if (!payload.sub) return null;

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        tokenVersion: true,
        accent: true,
        avatarSetAt: true,
        createdAt: true,
        /** Whether they came in through Plex, which is what makes switching to
            another profile in the same Home a thing they can do. */
        plexAccountId: true,
        /** A managed Plex Home profile, whose email is a placeholder. */
        plexManaged: true,
      },
    });

    if (!user) return null;

    /**
     * A token signed before the last revocation is no longer a session.
     *
     * `?? 0` covers tokens issued before this claim existed, so shipping the
     * change does not sign the whole instance out. The cookie is deliberately
     * *not* cleared here: this runs inside a `cache()`d read during rendering,
     * where writing a cookie is not allowed. It is stale rather than harmful —
     * it verifies to nothing — and the next `logout` clears it.
     */
    const signedWith = typeof payload.v === "number" ? payload.v : 0;
    if (signedWith !== user.tokenVersion) return null;

    return user;
  } catch {
    return null;
  }
});

/** Use inside route handlers / server actions that require auth. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
