import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin, PIN_COOKIE } from "@/lib/plex-sign-in";
import { SESSION_COOKIE } from "@/lib/session";
import { authUrl, createPin, PlexAuthError } from "@/lib/plex-tv";

/**
 * Signing in with Plex, first leg: ask plex.tv for a PIN, remember which one
 * in a short-lived cookie, and hand the browser to Plex's own sign-in page,
 * which sends it back to `/api/plex/pin/callback`. The login page's Plex
 * button and Settings' Link start here; signed in, the return leg links
 * rather than signs in. `?switch=1` is the avatar menu's Switch person, for a
 * Plex Home: it signs this person out first, since a managed profile holds no
 * token that reaches the rest of the household and the "who is watching"
 * question is the only honest way to hand the device over.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = publicOrigin(request);
  const switching = request.nextUrl.searchParams.get("switch") === "1";
  const signedIn = !switching && Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const back = signedIn ? "/settings/connections" : "/login";

  let pin;
  try {
    pin = await createPin();
  } catch (error) {
    const message = error instanceof PlexAuthError ? error.message : "Could not reach plex.tv";
    return NextResponse.redirect(new URL(`${back}?plex=${encodeURIComponent(message)}`, base));
  }

  const response = NextResponse.redirect(authUrl(pin, `${base}/api/plex/pin/callback`));
  if (switching) response.cookies.delete(SESSION_COOKIE);
  response.cookies.set(PIN_COOKIE, String(pin.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/",
    // Long enough to sign in and approve, short enough to be worthless afterwards.
    maxAge: 10 * 60,
  });
  return response;
}
