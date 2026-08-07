"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { db } from "./db";
import { KNOWN_PROVIDERS } from "./providers";

/** Saves which streaming services the user subscribes to. */
export async function saveProviders(ids: number[]) {
  const user = await requireUser();

  // Only ids we offer: the value is written straight into a query later, and an
  // arbitrary list from the client has no business being there.
  const allowed = new Set(KNOWN_PROVIDERS.map((provider) => provider.id));
  const clean = [...new Set(ids)].filter((id) => allowed.has(id));

  await db.user.update({
    where: { id: user.id },
    data: { providers: clean.length > 0 ? clean.join(",") : null },
  });

  revalidatePath("/", "layout");
  return { saved: clean.length };
}
