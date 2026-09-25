import { SignJWT, jwtVerify } from "jose";

/**
 * The session token, kept byte-compatible with the current app so its cookies
 * carry over: an HS256 JWT with the user id in `sub` and the account's
 * `tokenVersion` in `v`, thirty days long, in a cookie called `trekker_session`.
 *
 * Pure functions over a key, so they can be tested without a request.
 */

export const SESSION_COOKIE = "trekker_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type Session = { userId: string; tokenVersion: number };

export async function signSession(session: Session, key: Uint8Array): Promise<string> {
  return new SignJWT({ sub: session.userId, v: session.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

/** A verified session, or null for anything missing, forged, expired or malformed. */
export async function verifySession(
  token: string | undefined | null,
  key: Uint8Array,
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    // Tokens issued before the claim existed count as version 0, as they did before.
    const tokenVersion = typeof payload.v === "number" ? payload.v : 0;
    return { userId: payload.sub, tokenVersion };
  } catch {
    return null;
  }
}

/**
 * A signature proves who issued the token, not that it is still wanted: an
 * account's sessions are revoked by bumping `User.tokenVersion`, so a token is
 * only current when its stamp matches the row.
 */
export function isCurrent(session: Session, userTokenVersion: number): boolean {
  return session.tokenVersion === userTokenVersion;
}
