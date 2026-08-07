"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "./admin";
import { requireUser } from "./auth";
import { db } from "./db";
import { verifyPlex } from "./plex";

export type PlexFormState = { error?: string; ok?: string };

export async function savePlexSettings(
  _prev: PlexFormState,
  formData: FormData,
): Promise<PlexFormState> {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) {
    return { error: "Only the instance admin can change server connections" };
  }

  const url = String(formData.get("plexUrl") ?? "").trim();
  const token = String(formData.get("plexToken") ?? "").trim();

  if (!url || !token) return { error: "Both the server address and a token are required" };

  const identity = await verifyPlex(url, token);
  if (!identity) {
    return {
      error:
        "Could not reach that server. Check the address, that Trekker can see it on the network, and that the token is valid.",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { plexUrl: url, plexToken: token, plexMachineId: identity.machineId },
  });

  revalidatePath("/", "layout");
  return { ok: `Connected to ${identity.name}` };
}

/**
 * Sets the Plex username this profile watches under, by hand.
 *
 * Managed profiles in a Plex Home — a child account, typically — have no
 * plex.tv login of their own, so they cannot use "Continue with Plex" and have
 * no account id for us to match sessions against. Their username is the only
 * handle there is, and it is what both the session matcher and the history
 * importer fall back to.
 */
export async function savePlexUsername(
  _prev: PlexFormState,
  formData: FormData,
): Promise<PlexFormState> {
  const user = await requireUser();
  const username = String(formData.get("plexUsername") ?? "").trim();

  await db.user.update({
    where: { id: user.id },
    data: { plexUsername: username || null },
  });

  revalidatePath("/", "layout");
  return {
    ok: username
      ? `Watching as “${username}” on Plex.`
      : "Cleared. Sessions will no longer be matched by name.",
  };
}

export async function disconnectPlex() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) return;

  await db.user.update({
    where: { id: user.id },
    data: { plexUrl: null, plexToken: null, plexMachineId: null },
  });
  revalidatePath("/", "layout");
}
