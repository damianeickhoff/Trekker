import "server-only";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "trekker_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-insecure-secret-change-me",
);

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
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

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
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    return await db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
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
