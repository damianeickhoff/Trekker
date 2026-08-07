"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAdmin } from "./admin";
import { requireUser } from "./auth";
import { db } from "./db";
import { verifySeerr } from "./seerr";
import { defaultTraktClientId, TraktError, verifyTrakt } from "./trakt";

export type SettingsState = { error?: string; ok?: string };

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const submitted = String(formData.get("email") ?? "").trim().toLowerCase();

  /**
   * A managed Plex Home profile may leave this blank.
   *
   * They have no address of their own — the one on the row is a placeholder
   * minted to satisfy a unique index — and there is nothing they need one for:
   * they sign in through the Home, not by email. So an empty field means "leave
   * the stand-in alone" rather than an error, and filling it in is how such a
   * profile becomes reachable if they ever want it to be.
   */
  const keepPlaceholder = user.plexManaged && submitted.length === 0;

  const parsed = z
    .object({
      name: z.string().min(1, "Your name cannot be empty").max(60),
      email: z.string().email("Enter a valid email address"),
    })
    .safeParse({
      name: String(formData.get("name") ?? "").trim(),
      email: keepPlaceholder ? user.email : submitted,
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.email !== user.email) {
    const taken = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (taken) return { error: "That email is already registered" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, email: parsed.data.email },
  });

  revalidatePath("/", "layout");
  return { ok: "Profile updated" };
}

export async function uploadAvatar(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first" };
  if (file.size > MAX_AVATAR_BYTES) return { error: "Images must be 2 MB or smaller" };
  if (!ALLOWED.has(file.type)) return { error: "Use a PNG, JPEG or WebP image" };

  await db.user.update({
    where: { id: user.id },
    data: {
      avatarData: Buffer.from(await file.arrayBuffer()),
      avatarType: file.type,
      avatarSetAt: new Date(),
    },
  });

  revalidatePath("/", "layout");
  return { ok: "Picture updated" };
}

export async function removeAvatar() {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { avatarData: null, avatarType: null, avatarSetAt: null },
  });

  revalidatePath("/", "layout");
}

export async function saveSeerrSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) {
    return { error: "Only the instance admin can change server connections" };
  }

  const url = String(formData.get("seerrUrl") ?? "").trim();
  const apiKey = String(formData.get("seerrApiKey") ?? "").trim();

  if (!url || !apiKey) return { error: "Both the address and an API key are required" };

  const identity = await verifySeerr(url, apiKey);
  if (!identity) {
    return {
      error:
        "Could not reach that instance. Check the address, that Trekker can see it on the network, and that the API key is valid.",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { seerrUrl: url, seerrApiKey: apiKey },
  });

  revalidatePath("/", "layout");
  return { ok: `Connected to Overseerr ${identity.version}` };
}

/**
 * Trakt, unlike Plex and Overseerr, is a personal account rather than a shared
 * server, so every user stores their own username and client id.
 */
export async function saveTraktSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const username = String(formData.get("traktUsername") ?? "").trim();
  const typedClientId = String(formData.get("traktClientId") ?? "").trim();

  if (!username) return { error: "Enter your Trakt username" };

  // An empty client id field means "keep what is stored", so the saved value is
  // never wiped just by saving a new username.
  const existing = await db.user.findUnique({
    where: { id: user.id },
    select: { traktClientId: true },
  });
  const clientId = typedClientId || existing?.traktClientId || defaultTraktClientId();

  if (!clientId) {
    return { error: "Enter a Trakt client id — create an app at trakt.tv/oauth/applications" };
  }

  try {
    await verifyTrakt(username, clientId);
  } catch (error) {
    if (error instanceof TraktError) return { error: error.message };
    return { error: "Could not reach Trakt" };
  }

  await db.user.update({
    where: { id: user.id },
    // Only persist a client id the user actually typed; falling back to the
    // instance-wide one stays a fallback rather than being copied in.
    data: {
      traktUsername: username,
      ...(typedClientId ? { traktClientId: typedClientId } : {}),
    },
  });

  revalidatePath("/", "layout");
  return { ok: `Connected to Trakt as ${username}` };
}

export async function disconnectTrakt() {
  const user = await requireUser();

  await db.user.update({
    where: { id: user.id },
    data: { traktUsername: null, traktClientId: null },
  });
  revalidatePath("/", "layout");
}

export async function disconnectSeerr() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) return;

  await db.user.update({
    where: { id: user.id },
    data: { seerrUrl: null, seerrApiKey: null },
  });
  revalidatePath("/", "layout");
}
