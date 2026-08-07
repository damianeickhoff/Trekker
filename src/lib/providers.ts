import "server-only";
import { db } from "./db";

/**
 * The streaming services a user pays for.
 *
 * Stored as TMDB provider ids, which is what the "where to watch" data is keyed
 * by — so "can I already watch this?" is a set lookup rather than a name match
 * against whatever JustWatch happens to call a service this week.
 */

/**
 * The services worth offering. TMDB has hundreds; these are the ones people
 * have.
 *
 * Each entry carries every provider id that means the same subscription. TMDB
 * lists a service under several ids — "Amazon Prime Video" and "Prime Video"
 * are different rows, and which one a title comes back under varies by title
 * and region — so one id per service silently missed half the matches.
 */
export type Provider = { id: number; name: string; ids: number[] };

export const KNOWN_PROVIDERS: Provider[] = [
  { id: 8, name: "Netflix", ids: [8, 1796] },
  { id: 9, name: "Prime Video", ids: [9, 119, 2100] },
  { id: 337, name: "Disney+", ids: [337, 390, 2074] },
  { id: 350, name: "Apple TV+", ids: [350, 2552] },
  { id: 1899, name: "HBO Max", ids: [1899, 384, 1825, 3186] },
  { id: 15, name: "Hulu", ids: [15] },
  { id: 531, name: "Paramount+", ids: [531, 1770, 4085] },
  { id: 386, name: "Peacock", ids: [386, 387] },
  { id: 619, name: "SkyShowtime", ids: [619, 1773] },
  { id: 71, name: "Discovery+", ids: [71, 510, 520, 4353] },
  { id: 72, name: "Videoland", ids: [72, 30] },
  { id: 563, name: "Viaplay", ids: [563, 76] },
  { id: 283, name: "Crunchyroll", ids: [283, 1968] },
  { id: 11, name: "MUBI", ids: [11] },
];

/** Every id that counts as "the user subscribes to this", flattened. */
export function expandProviders(chosen: number[]): Set<number> {
  const wanted = new Set(chosen);
  const all = new Set<number>();

  for (const provider of KNOWN_PROVIDERS) {
    if (!wanted.has(provider.id)) continue;
    for (const id of provider.ids) all.add(id);
  }

  return all;
}

export function parseProviders(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function getUserProviders(userId: string): Promise<number[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { providers: true },
  });
  return parseProviders(user?.providers);
}
