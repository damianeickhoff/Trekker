import "server-only";
import { cache } from "react";
import { db } from "./db";

/**
 * The first account created owns this instance. Server integrations (Plex,
 * Overseerr) are configured once by that account and apply to everybody.
 */
export const getAdmin = cache(async () => {
  return db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
});

export async function isAdmin(userId: string) {
  const admin = await getAdmin();
  return admin?.id === userId;
}
