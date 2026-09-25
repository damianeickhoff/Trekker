import "server-only";
import { db } from "./db";
import { endHandoff, readHandoff, startHandoff } from "./plex-handoff";
import { getAccount, getHomeUsers, PlexAuthError, switchToHomeUser, type HomeUser, type PlexAccount } from "./plex-tv";
import { sealSecret } from "./token-vault";

/**
 * Which Trekker account a Plex identity is: the rules the current app signs
 * people in by, pulled out of the routes so they can be tested.
 *
 * - Signed in already: this is a link from Settings, and the Plex account is
 *   attached to the account in session, unless it already belongs to someone
 *   else here, which is refused rather than quietly switching accounts.
 * - A Plex Home with more than one person: nobody is signed in yet, and the
 *   picker asks who this is (`/login/profile`).
 * - Otherwise: the account linked to that plex.tv id, then the one with the
 *   same email (Plex verifies addresses, so a password account is linked
 *   rather than doubled), else a new account with no password of its own.
 */

export type SignInOutcome =
  | { kind: "linked"; userId: string }
  | { kind: "taken" }
  | { kind: "signed-in"; userId: string }
  | { kind: "choose"; handle: string };

/**
 * A managed profile has no email, and `User.email` is required and unique, so
 * one is minted from its plex.tv id under `.invalid`, which RFC 2606 reserves
 * for addresses that must never resolve. The current app's form, so its rows
 * match.
 */
export function placeholderEmail(plexAccountId: string) {
  return `plex-${plexAccountId}@managed.trekker.invalid`;
}

/** Names are not unique, but two identical rows in the picker or among friends help nobody. */
async function distinctName(preferred: string) {
  const clash = await db.user.findFirst({ where: { name: preferred }, select: { id: true } });
  return clash ? `${preferred} (Plex)` : preferred;
}

/** The owner of a login, or anyone signing in alone: by plex.tv id, then email, else new. */
export async function seatAccount(account: PlexAccount, token: string): Promise<string> {
  const sealed = sealSecret(token);
  const linked = await db.user.findUnique({ where: { plexAccountId: account.id }, select: { id: true } });
  if (linked) {
    // Refreshed on every sign-in: it is what proves access to the server.
    await db.user.update({ where: { id: linked.id }, data: { plexAuthToken: sealed, plexUsername: account.username } });
    return linked.id;
  }
  const byEmail = await db.user.findUnique({ where: { email: account.email }, select: { id: true } });
  if (byEmail) {
    await db.user.update({
      where: { id: byEmail.id },
      data: { plexAccountId: account.id, plexAuthToken: sealed, plexUsername: account.username },
    });
    return byEmail.id;
  }
  const created = await db.user.create({
    data: {
      email: account.email,
      name: await distinctName(account.username),
      plexAccountId: account.id,
      plexAuthToken: sealed,
      plexUsername: account.username,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * A person in a Plex Home, other than its owner, at their own account: by
 * plex.tv id (so renaming a profile in Plex orphans nothing), then, for a
 * full member with a real address, by email, else a new account. The Plex
 * name is kept as `plexUsername`, which is what their sessions and scrobbles
 * are matched on.
 */
export async function seatHomeProfile(user: HomeUser, token: string): Promise<string> {
  const data = { plexAuthToken: sealSecret(token), plexUsername: user.username ?? user.title, plexManaged: user.restricted };
  const linked = await db.user.findUnique({ where: { plexAccountId: user.id }, select: { id: true } });
  if (linked) {
    await db.user.update({ where: { id: linked.id }, data });
    return linked.id;
  }
  if (user.email && !user.restricted) {
    const byEmail = await db.user.findUnique({ where: { email: user.email }, select: { id: true, plexAccountId: true } });
    if (byEmail && !byEmail.plexAccountId) {
      await db.user.update({ where: { id: byEmail.id }, data: { ...data, plexAccountId: user.id } });
      return byEmail.id;
    }
  }
  const created = await db.user.create({
    data: {
      ...data,
      email: user.email ?? placeholderEmail(user.id),
      name: await distinctName(user.title),
      plexAccountId: user.id,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Friends with the rest of the Home, once. Everything social here is gated on
 * friendship, and a household split into profiles has none; being in the same
 * Plex Home is a relationship plex.tv has already verified. Stamped so it
 * happens once: unfriending deletes the row, and a standing introduction
 * would put it back on every sign-in.
 */
export async function introduceToHome(userId: string, home: { id: string }[]) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { plexHomeLinkedAt: true } });
  if (!me || me.plexHomeLinkedAt) return;
  const housemates = await db.user.findMany({
    where: { plexAccountId: { in: home.map((u) => u.id) }, id: { not: userId } },
    select: { id: true },
  });
  const now = new Date();
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
    if (existing) {
      await db.friendship.update({ where: { id: existing.id }, data: { status: "accepted", respondedAt: now } });
    } else {
      await db.friendship.create({ data: { requesterId: userId, addresseeId: mate.id, status: "accepted", respondedAt: now } });
    }
  }
  await db.user.update({ where: { id: userId }, data: { plexHomeLinkedAt: now } });
}

/** The return leg of the PIN flow, once plex.tv has handed over a token. */
export async function completePlexSignIn(token: string, viewerId: string | null): Promise<SignInOutcome> {
  const account = await getAccount(token);
  const linked = await db.user.findUnique({ where: { plexAccountId: account.id }, select: { id: true } });

  if (viewerId) {
    if (linked && linked.id !== viewerId) return { kind: "taken" };
    await db.user.update({
      where: { id: viewerId },
      data: { plexAccountId: account.id, plexAuthToken: sealSecret(token), plexUsername: account.username },
    });
    return { kind: "linked", userId: viewerId };
  }

  const home = await getHomeUsers(token);
  if (home.length > 1) return { kind: "choose", handle: startHandoff(token, home) };

  return { kind: "signed-in", userId: await seatAccount(account, token) };
}

export type ChoiceOutcome = { ok: true; userId: string } | { ok: false; error: string };

/**
 * The picker's answer: one profile of the Home that just signed in. The set
 * on offer was fixed when the handoff began, so an id made up in the browser
 * is simply not there. The owner is not switched to (they are already who
 * signed in); everyone else is exchanged for a token of their own.
 */
export async function chooseHomeProfile(handle: string | null | undefined, profileId: string, pin: string): Promise<ChoiceOutcome> {
  const handoff = readHandoff(handle);
  if (!handoff) return { ok: false, error: "That sign-in took too long. Start again." };
  const profile = handoff.users.find((u) => u.id === profileId);
  if (!profile) return { ok: false, error: "Pick a profile to carry on." };
  if (profile.protected && !pin) return { ok: false, error: `${profile.title} needs their Plex PIN.` };

  let userId: string;
  try {
    if (profile.admin) {
      userId = await seatAccount(await getAccount(handoff.ownerToken), handoff.ownerToken);
    } else {
      const token = await switchToHomeUser(handoff.ownerToken, profile, pin || undefined);
      userId = await seatHomeProfile(profile, token);
    }
  } catch (error) {
    return { ok: false, error: error instanceof PlexAuthError ? error.message : "Could not sign in as that profile. Try again." };
  }

  // A courtesy on top of being seated: it may not fail the sign-in.
  await introduceToHome(userId, handoff.users).catch((error) => console.error("Could not introduce a Plex Home", error));
  endHandoff(handle);
  return { ok: true, userId };
}
