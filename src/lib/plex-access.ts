import "server-only";
import { cache } from "react";
import { getAdmin } from "./admin";
import { db } from "./db";
import { clientIdentifier } from "./plex-auth";

/**
 * Whether a signed-in account may ask this install to fetch content.
 *
 * Anyone can create an account here, and requesting a title spends the owner's
 * disk and bandwidth on the owner's server. Those are not the same privilege,
 * so having one should not grant the other: the people who may request are the
 * people who could watch the result, which is the Plex server's own home users
 * and the friends it is shared with.
 *
 * The test is deliberately asked of the *viewer's* credentials rather than of
 * the owner's. Enumerating the owner's friends means a second API surface, a
 * different answer for home users than for shared ones, and a list that goes
 * stale the moment somebody is removed. Asking "which servers can you see?"
 * with the viewer's own token answers all of that in one call, and answers it
 * the way Plex itself would — access revoked on plex.tv is access lost here on
 * the next check.
 *
 * Memoised per request: a title page asks once for the badge and again if the
 * request is actually made, and that is one round trip either way.
 */
export const hasPlexAccess = cache(async function hasPlexAccess(
  userId: string,
): Promise<boolean> {
  const admin = await getAdmin();
  if (!admin) return false;

  // The owner is not a guest on their own server, and may have linked Plex to
  // Trekker without their own account appearing in any share list.
  if (userId === admin.id) return true;

  const [server, viewer] = await Promise.all([
    db.user.findUnique({
      where: { id: admin.id },
      select: { plexMachineId: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { plexAuthToken: true },
    }),
  ]);

  // Nothing to check against, or nothing to check with. Both mean "no", and
  // deliberately so: an install whose owner has not linked Plex has no way to
  // tell a friend from a stranger, and refusing is the safe direction to be
  // wrong in.
  if (!server?.plexMachineId || !viewer?.plexAuthToken) return false;

  try {
    const response = await fetch("https://plex.tv/api/v2/resources", {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": viewer.plexAuthToken,
        "X-Plex-Client-Identifier": clientIdentifier(),
      },
      // Never cached. The URL is identical for every user and only the header
      // differs, so a shared cache would hand one person's answer to the next.
      cache: "no-store",
    });

    if (!response.ok) return false;

    const resources = (await response.json()) as { clientIdentifier?: string }[];
    return resources.some((resource) => resource.clientIdentifier === server.plexMachineId);
  } catch {
    // plex.tv unreachable. Refusing here means a request fails during an
    // outage, which is recoverable; allowing would mean an outage is how you
    // get past the check.
    return false;
  }
});
