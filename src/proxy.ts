import { NextResponse, type NextRequest } from "next/server";
import { authSecretBytes } from "@/lib/secrets";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * The sign-in gate. Signature only, no database: this runs on every page and
 * RSC request, and a revoked-but-signed token is caught by `getCurrentUser`
 * where data is actually read.
 */
export async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, authSecretBytes());
  if (session) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except sign-in, framework assets, what the worker and the
  // installed app fetch before anyone has signed in, and the cron routes, which
  // carry their own secret instead of a session (the cron jobs, the list refresh
  // the current app scheduled, the morning push, and the Plex and Overseerr
  // webhooks at both addresses), the Plex sign-in, which is how a session
  // starts, and the health check, which the container's HEALTHCHECK calls with no
  // session and which says nothing but "up" and the build.
  matcher: [
    "/((?!login|_next/static|_next/image|sw\\.js|manifest\\.webmanifest|icons/|favicon\\.ico|robots\\.txt|api/cron|api/lists/refresh|api/notifications/run|api/webhooks/|api/plex/webhook|api/plex/pin|api/health).*)",
  ],
};
