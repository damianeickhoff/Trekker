"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "./auth";
import { db } from "./db";
import { getAccount, PlexAuthError } from "./plex-auth";
import { endHandoff, HANDOFF_COOKIE, readHandoff } from "./plex-handoff";
import { switchToHomeUser } from "./plex-home";
import { introduceToHome, seatHomeProfile } from "./plex-seat";
import { sealSecret } from "./token-vault";

export type ProfileChoiceState = { error?: string };

/**
 * Signs in as one profile of the Plex Home that just authenticated.
 *
 * The owner's token never comes anywhere near the browser: the form sends the
 * id of a profile, and the token it is exchanged against is read out of the
 * handoff the callback left on the server. Which also means the set of profiles
 * anybody can ask for is fixed at the top of the flow — a made-up id is not in
 * the handoff, so it is not on offer.
 */
export async function chooseProfile(
  _prev: ProfileChoiceState,
  formData: FormData,
): Promise<ProfileChoiceState> {
  const jar = await cookies();
  const handle = jar.get(HANDOFF_COOKIE)?.value;
  const handoff = readHandoff(handle);

  if (!handoff) return { error: "That sign-in took too long. Start again." };

  const wanted = String(formData.get("profile") ?? "");
  const profile = handoff.users.find((user) => user.id === wanted);
  if (!profile) return { error: "Pick a profile to carry on." };

  const pin = String(formData.get("pin") ?? "").trim();
  if (profile.protected && !pin) return { error: `${profile.title} needs their Plex PIN.` };

  let userId: string;

  try {
    /**
     * The owner is not switched to — they are already who plex.tv said signed
     * in, and asking to switch to yourself is a round trip that can only fail.
     * Everyone else is exchanged for a token of their own.
     */
    if (profile.admin) {
      userId = await seatOwner(profile.id, handoff.ownerToken, profile.title);
    } else {
      const token = await switchToHomeUser(handoff.ownerToken, profile, pin || undefined);
      userId = await seatHomeProfile(profile, token);
    }
  } catch (error) {
    if (error instanceof PlexAuthError) return { error: error.message };
    return { error: "Could not sign in as that profile. Try again." };
  }

  /**
   * The one moment the whole household is knowable: the handoff holds every
   * profile in the Home, and this profile has just proved it is one of them.
   * Nowhere else in the app is that list in hand.
   *
   * Not allowed to fail the sign-in. Being seated at the right profile is the
   * point of this screen; who it is friends with is a courtesy on top of it.
   */
  await introduceToHome(userId, handoff.users).catch((error) => {
    console.error("Could not connect a Plex Home", error);
  });

  // Spent, so the token cannot be used to seat somebody at a second profile
  // afterwards.
  endHandoff(handle);
  jar.delete(HANDOFF_COOKIE);

  await createSession(userId);
  redirect("/");
}

/**
 * The owner's own row, matched the way the callback has always matched it:
 * by plex id, then by their verified email, and created if neither exists.
 */
async function seatOwner(plexAccountId: string, token: string, title: string) {
  const linked = await db.user.findUnique({
    where: { plexAccountId },
    select: { id: true },
  });

  if (linked) {
    await db.user.update({
      where: { id: linked.id },
      // Sealed at rest — see token-vault.ts. Same for every write below.
      data: { plexAuthToken: sealSecret(token) },
    });
    return linked.id;
  }

  // Reachable only when the Home owner has never signed in here before, which
  // makes this their first Trekker account rather than a second one.
  const account = await getAccount(token);

  const byEmail = await db.user.findUnique({ where: { email: account.email } });
  if (byEmail) {
    await db.user.update({
      where: { id: byEmail.id },
      data: {
        plexAccountId: account.id,
        plexAuthToken: sealSecret(token),
        plexUsername: account.username,
      },
    });
    return byEmail.id;
  }

  const created = await db.user.create({
    data: {
      email: account.email,
      name: account.username || title,
      plexAccountId: account.id,
      plexAuthToken: sealSecret(token),
      plexUsername: account.username,
    },
  });

  return created.id;
}

/** Abandons the choice and goes back to the sign-in page. */
export async function cancelProfileChoice() {
  const jar = await cookies();
  endHandoff(jar.get(HANDOFF_COOKIE)?.value);
  jar.delete(HANDOFF_COOKIE);
  redirect("/login");
}

/**
 * Hands the device to somebody else in the Home.
 *
 * It signs out first and then starts the Plex flow again, which is the honest
 * description of what is happening — a managed profile holds no token that can
 * reach the rest of the Home, so there is nothing to switch *with* except the
 * owner's account, and asking for it means signing in. Going through the front
 * door also means the PIN on a protected profile is asked for, which quietly
 * skipping to a picker would not.
 */
export async function switchProfile() {
  await destroySession();
  redirect("/api/auth/plex");
}
