import { NextResponse, type NextRequest } from "next/server";
import { authUrl, callbackOrigin, createPin, PIN_COOKIE, PlexAuthError } from "@/lib/plex-auth";

/**
 * Step one of signing in with Plex: ask plex.tv for a PIN, remember which one
 * we asked for, and hand the browser to Plex's own sign-in page.
 */
export async function GET(request: NextRequest) {
  const base = callbackOrigin(request);

  let pin;
  try {
    pin = await createPin();
  } catch (error) {
    const message =
      error instanceof PlexAuthError ? error.message : "Could not reach plex.tv";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, base));
  }

  const response = NextResponse.redirect(authUrl(pin, `${base}/api/auth/plex/callback`));

  response.cookies.set(PIN_COOKIE, String(pin.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: base.startsWith("https://"),
    path: "/",
    // Long enough to sign in and approve, short enough to be worthless later.
    maxAge: 60 * 10,
  });

  return response;
}
