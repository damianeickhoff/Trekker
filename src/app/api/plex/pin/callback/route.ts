import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { HANDOFF_COOKIE, HANDOFF_TTL_S } from "@/lib/plex-handoff";
import { finishPlexSignIn, PIN_COOKIE, publicOrigin } from "@/lib/plex-sign-in";

/**
 * Signing in with Plex, return leg: Plex has sent the browser back, so the PIN
 * is polled for its token and the token matched to an account (see
 * `lib/plex-sign-in.ts`). Signed in already, it links instead.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = publicOrigin(request);
  const secure = base.startsWith("https://");
  const pinId = Number(request.cookies.get(PIN_COOKIE)?.value) || null;
  const viewer = await getCurrentUser();

  const decision = await finishPlexSignIn(pinId, viewer?.id ?? null);
  const response = NextResponse.redirect(new URL(decision.to, base));
  response.cookies.delete(PIN_COOKIE);

  if (decision.handoff) {
    response.cookies.set(HANDOFF_COOKIE, decision.handoff, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: HANDOFF_TTL_S });
  }
  if (decision.signIn) {
    const user = await db.user.findUnique({ where: { id: decision.signIn }, select: { tokenVersion: true } });
    const cookie = await sessionCookie(decision.signIn, user?.tokenVersion ?? 0, secure);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
