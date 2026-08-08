import "server-only";
import { db } from "./db";
import type { HomeUser } from "./plex-home";
import { sealSecret } from "./token-vault";

/**
 * Finding — or making — the Trekker account a Plex identity belongs to.
 *
 * Pulled out of the sign-in callback because there are two ways in now. The
 * owner of a Plex Home arrives with a plex.tv account that has an email on it;
 * a managed profile arrives with a name, a face and nothing else. Both end at
 * the same question, and it should be answered the same way in both cases.
 */

/**
 * A managed profile has no email address, and `User.email` is required and
 * unique — so one is minted from the thing about them that is stable and
 * already unique: their plex.tv id.
 *
 * `.invalid` is reserved by RFC 2606 precisely so that addresses which must
 * exist but must never resolve have somewhere to live. Nothing will ever send
 * to it, and picking a domain somebody owns would mean it might.
 */
export function placeholderEmail(plexAccountId: string) {
  return `plex-${plexAccountId}@managed.trekker.invalid`;
}

/** Whether an address is one of the above, for anything about to display it. */
export function isPlaceholderEmail(email: string) {
  return email.endsWith("@managed.trekker.invalid");
}

/**
 * The line to print under somebody's name.
 *
 * Every surface that shows an address — the account menu, the profile banner,
 * the settings header — goes through here, so a placeholder cannot leak into
 * one of them by being forgotten. What a managed profile gets instead is the
 * true thing: that it is a profile in a Plex Home.
 */
export function displayEmail(email: string) {
  return isPlaceholderEmail(email) ? "Plex Home profile" : email;
}

/**
 * Makes sure a name is free before it is used.
 *
 * Two profiles in a Home called "Kids" is unlikely; two people called "Sam"
 * across a Home and a friend's account is not. Names are not unique in the
 * schema and nothing breaks if they collide — this only exists so the picker
 * and the friends list do not show two identical rows with no way to tell them
 * apart.
 */
async function distinctName(preferred: string, exceptUserId?: string) {
  const clash = await db.user.findFirst({
    where: {
      name: preferred,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });

  return clash ? `${preferred} (Plex)` : preferred;
}

/**
 * Makes friends of the people who share a Plex Home.
 *
 * Everything social in Trekker is gated on friendship — what a friend is
 * watching right now, their reviews, the comparison panel — and a household
 * that has just been split into separate profiles has none of it. Asking
 * somebody to send a friend request to their own partner, who is sitting on the
 * same sofa watching the same server, is a form for the sake of a form.
 *
 * And it is not a guess. Being in somebody's Plex Home is a relationship
 * plex.tv has already verified; this only writes down what the Home already
 * says. It stays undoable: either side can remove the other afterwards.
 *
 * Which is exactly why it happens once and not on every sign-in. Removing a
 * friend deletes the row rather than marking it, so a standing introduction
 * would put back what somebody had just taken away, every time they signed in.
 * The stamp is the memory of having done it.
 */
export async function introduceToHome(userId: string, home: { id: string }[]) {
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { plexHomeLinkedAt: true },
  });

  if (!me || me.plexHomeLinkedAt) return;

  const housemates = await db.user.findMany({
    where: {
      plexAccountId: { in: home.map((user) => user.id) },
      id: { not: userId },
    },
    select: { id: true },
  });

  for (const mate of housemates) {
    const existing = await db.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: mate.id },
          { requesterId: mate.id, addresseeId: userId },
        ],
      },
      select: { id: true, status: true },
    });

    if (existing?.status === "accepted") continue;

    // An outstanding request between two people who turn out to share a Plex
    // Home is answered by that fact.
    if (existing) {
      await db.friendship.update({
        where: { id: existing.id },
        data: { status: "accepted", respondedAt: new Date() },
      });
      continue;
    }

    await db.friendship.create({
      data: {
        requesterId: userId,
        addresseeId: mate.id,
        status: "accepted",
        respondedAt: new Date(),
      },
    });
  }

  // Stamped whether or not anybody was found: a profile that signs in before
  // the rest of its household exists has still had its introduction, and the
  // ones that arrive later will reach back to it themselves.
  await db.user.update({
    where: { id: userId },
    data: { plexHomeLinkedAt: new Date() },
  });
}

/**
 * Seats a managed Plex Home profile at its own Trekker account, creating one
 * the first time it signs in.
 *
 * Keyed on the plex.tv id rather than on the name: renaming a profile in Plex
 * should not orphan everything that profile has watched.
 */
export async function seatHomeProfile(user: HomeUser, token: string): Promise<string> {
  const existing = await db.user.findUnique({
    where: { plexAccountId: user.id },
    select: { id: true },
  });

  if (existing) {
    // The token is what reads their watchlist and proves their access to the
    // server, and a switched token is short-lived — so it is refreshed on every
    // sign-in rather than trusted to last.
    await db.user.update({
      where: { id: existing.id },
      data: {
        // Sealed at rest — see token-vault.ts.
        plexAuthToken: sealSecret(token),
        plexUsername: user.username ?? user.title,
        plexManaged: user.restricted,
      },
    });
    return existing.id;
  }

  const created = await db.user.create({
    data: {
      // A full member of a Home has a real address; only a managed profile
      // needs one invented.
      email: user.email ?? placeholderEmail(user.id),
      name: await distinctName(user.title),
      plexAccountId: user.id,
      plexAuthToken: sealSecret(token),
      // What ties their viewing on the server back to this profile. It is the
      // same field the settings page has always offered to fill in by hand —
      // this just knows the answer without being told.
      plexUsername: user.username ?? user.title,
      plexManaged: user.restricted,
    },
  });

  return created.id;
}
