"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { db } from "./db";

/**
 * The backdrop shown behind a profile header. Only the TMDB path is stored, so
 * the image is served by the same CDN as everywhere else and can be re-sized
 * per surface rather than being copied into the database.
 */
export async function setProfileCover(
  cover: { backdrop: string; title: string } | null,
): Promise<{ ok: boolean }> {
  const user = await requireUser();

  // TMDB paths look like `/abc123.jpg`; anything else is not ours to render.
  if (cover && !/^\/[\w.-]+$/.test(cover.backdrop)) return { ok: false };

  await db.user.update({
    where: { id: user.id },
    data: {
      coverBackdrop: cover?.backdrop ?? null,
      coverTitle: cover ? cover.title.slice(0, 200) : null,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
