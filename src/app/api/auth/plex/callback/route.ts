import { NextResponse, type NextRequest } from "next/server";
import { createSession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callbackOrigin, claimPin, getAccount, PIN_COOKIE, PlexAuthError } from "@/lib/plex-auth";

/**
 * Step two: Plex has sent the browser back, so the PIN should now be claimable
 * for a token. The token identifies a plex.tv account, which is matched to a
 * Trekker account — linked by plex id, then by email, and created if neither
 * exists.
 */

// Plex usually writes the token before it forwards, but not always.
const ATTEMPTS = 8;
const GAP_MS = 750;

export async function GET(request: NextRequest) {
  const base = callbackOrigin(request);
  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, base));

  const pinId = Number(request.cookies.get(PIN_COOKIE)?.value);
  if (!pinId) return fail("That sign-in request expired. Try again.");

  let token: string | null = null;
  try {
    for (let attempt = 0; attempt < ATTEMPTS && token === null; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
      token = await claimPin(pinId);
    }
  } catch (error) {
    return fail(error instanceof PlexAuthError ? error.message : "Could not reach plex.tv");
  }

  if (!token) return fail("Plex did not confirm the sign-in. Try again.");

  let account;
  try {
    account = await getAccount(token);
  } catch (error) {
    return fail(error instanceof PlexAuthError ? error.message : "Could not reach plex.tv");
  }

  const linked = await db.user.findUnique({ where: { plexAccountId: account.id } });

  // Coming from Settings rather than the sign-in page: this is a link, not a
  // sign-in, so the token belongs on the account already in session. Without
  // this, linking a Plex account that happens to match another Trekker profile
  // would silently sign you in as that profile.
  const viewer = await getCurrentUser();
  if (viewer && (!linked || linked.id === viewer.id)) {
    await db.user.update({
      where: { id: viewer.id },
      data: {
        plexAccountId: account.id,
        plexAuthToken: token,
        plexUsername: account.username,
      },
    });

    const response = NextResponse.redirect(new URL("/settings", base));
    response.cookies.delete(PIN_COOKIE);
    return response;
  }

  let userId = linked?.id;

  if (!userId) {
    // Same email means the same person: Plex verifies addresses, so this links
    // an existing password account rather than creating a duplicate.
    const byEmail = await db.user.findUnique({ where: { email: account.email } });

    if (byEmail) {
      await db.user.update({
        where: { id: byEmail.id },
        data: {
          plexAccountId: account.id,
          plexAuthToken: token,
          plexUsername: account.username,
        },
      });
      userId = byEmail.id;
    } else {
      const created = await db.user.create({
        data: {
          email: account.email,
          name: account.username,
          plexAccountId: account.id,
          plexAuthToken: token,
          plexUsername: account.username,
        },
      });
      userId = created.id;
    }
  } else {
    // Already linked: refresh the token, which is what reads their watchlist.
    await db.user.update({
      where: { id: userId },
      data: { plexAuthToken: token, plexUsername: account.username },
    });
  }

  await createSession(userId);

  const response = NextResponse.redirect(new URL("/", base));
  response.cookies.delete(PIN_COOKIE);
  return response;
}
