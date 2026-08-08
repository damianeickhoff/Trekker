import { cache } from "react";
import { db } from "./db";

/**
 * Which country's streaming availability to show.
 *
 * Availability is per country and there is nothing in a TMDB key to infer it
 * from, so the instance sets a default via `WATCH_REGION` — an ISO 3166-1
 * country code such as `NL`, `GB` or `US` — and any account can override it
 * under Settings, for the housemate whose catalogue genuinely is a different
 * country's.
 */
export function watchRegion() {
  const configured = process.env.WATCH_REGION?.trim().toUpperCase();
  return configured && /^[A-Z]{2}$/.test(configured) ? configured : "US";
}

const VALID = /^[A-Z]{2}$/;

/**
 * The region one person's pages should use: their own setting where they have
 * made one, the instance's otherwise — including for `null` (signed out) and
 * for anything unreadable, because a wrong-but-working catalogue beats an
 * error. Memoised per request; half the surfaces on a title page ask.
 */
export const regionForUser = cache(async function regionForUser(
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return watchRegion();

  const user = await db.user
    .findUnique({ where: { id: userId }, select: { region: true } })
    .catch(() => null);

  const own = user?.region?.trim().toUpperCase();
  return own && VALID.test(own) ? own : watchRegion();
});
