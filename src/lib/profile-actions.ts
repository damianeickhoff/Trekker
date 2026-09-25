"use server";

import { refresh, updateTag } from "next/cache";
import { getCurrentUser } from "./auth";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, removeAvatar, saveAvatar } from "./avatar";
import { db } from "./db";
import { bellTag } from "./notifications";

/*
 * Editing your own profile: the name and the picture. The picture arrives
 * already scaled down in the browser (512px, JPEG), which keeps it under the
 * server action's body limit; the server still checks the bytes are the image
 * they claim to be, whatever the browser said.
 */

export type ProfileFormState = { ok?: string; error?: string };

const NAME_MAX = 60;

function sniff(bytes: Buffer): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export async function saveProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "A name, please: it is how friends find you." };
  if (name.length > NAME_MAX) return { error: `Names stop at ${NAME_MAX} characters.` };
  if (name !== user.name) await db.user.update({ where: { id: user.id }, data: { name } });

  const file = form.get("avatar");
  if (form.get("removeAvatar") === "1") {
    await removeAvatar(user.id);
  } else if (file instanceof File && file.size > 0) {
    if (file.size > AVATAR_MAX_BYTES) return { error: "That picture is too large; 2 MB at most." };
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = sniff(bytes);
    if (!type || !AVATAR_TYPES[type]) return { error: "That is not a JPEG, PNG or WebP picture." };
    await saveAvatar(user.id, bytes, type);
  }

  // The name and picture ride on the bell's answer, which the chrome draws.
  updateTag(bellTag(user.id));
  refresh();
  return { ok: "Saved" };
}
