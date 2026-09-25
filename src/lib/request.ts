import "server-only";
import { cache } from "react";
import { db } from "./db";
import { reachableServers } from "./plex-tv";
import { seerrConnection, seerrFetch, seerrUserFor } from "./seerr";
import { instanceAdmin } from "./title";
import { movieDetailsKey, tmdbPeek, tvDetailsKey, type MediaType, type MovieDetails, type TvDetails } from "./tmdb";
import { openSecret } from "./token-vault";

/**
 * Asking the instance's Overseerr to fetch a title. The same calls and
 * refusals as the current app, filed as the person asking where Overseerr
 * knows them, so its own request list and quotas say who it was.
 */

/**
 * Whether this account may spend the owner's disk on a download: the owner,
 * and anyone whose own Plex account can see the owner's server, which is the
 * household and the friends it is shared with. Asked of the viewer's own token,
 * so access revoked on plex.tv is access lost here. Refusing is the safe
 * direction to be wrong in, so anything missing or unreachable is "no".
 */
export const mayRequest = cache(async (userId: string): Promise<boolean> => {
  const admin = await instanceAdmin();
  if (!admin) return false;
  if (userId === admin.id) return true;

  const viewer = await db.user.findUnique({ where: { id: userId }, select: { plexAuthToken: true } });
  const token = openSecret(viewer?.plexAuthToken);
  if (!admin.plexMachineId || !token) return false;
  const reachable = await reachableServers(token).catch(() => [] as string[]);
  return reachable.includes(admin.plexMachineId);
});

/** Whether this instance has an Overseerr to ask: what Request all and the auto-request switch are offered on. */
export async function seerrConnected(): Promise<boolean> {
  const admin = await instanceAdmin();
  return Boolean(admin?.seerrUrl && admin?.seerrApiKey);
}

export type RequestOutcome = { ok: true } | { ok: false; error: string };

/** The name and poster from whatever the cache holds, for the row the bell reads later. Never the network. */
async function cachedDescription(mediaType: MediaType, tmdbId: number) {
  const key = mediaType === "tv" ? tvDetailsKey(tmdbId) : movieDetailsKey(tmdbId);
  const details = await tmdbPeek<MovieDetails & TvDetails>(key.path, key.params).catch(() => null);
  return { title: (mediaType === "tv" ? details?.name : details?.title) ?? null, poster: details?.poster_path ?? null };
}

/**
 * Files the request. A show asks for every season, as the current app's
 * button did. On success the `Availability` row says so at once, with who
 * asked and what it is called, so the page and every poster mark show the
 * clock without waiting for the daily sweep, and the bell can tell them when
 * it arrives.
 */
export async function requestOnSeerr(
  userId: string,
  mediaType: MediaType,
  tmdbId: number,
  describe: { title?: string | null; poster?: string | null } = {},
): Promise<RequestOutcome> {
  if (!(await mayRequest(userId))) {
    return { ok: false, error: "Requesting is limited to people with access to this Plex server." };
  }
  const conn = await seerrConnection();
  if (!conn) return { ok: false, error: "No Overseerr instance is connected." };

  const who = await db.user.findUnique({ where: { id: userId }, select: { plexAccountId: true, email: true, plexUsername: true } });
  const seerrUser = who ? await seerrUserFor(conn, who) : null;

  const body: Record<string, unknown> = { mediaType, mediaId: tmdbId };
  if (mediaType === "tv") body.seasons = "all";
  if (seerrUser !== null) body.userId = seerrUser;

  const filed = await seerrFetch<{ id?: number }>(conn, "/api/v1/request", { method: "POST", body: JSON.stringify(body) });
  if (!filed) return { ok: false, error: "Overseerr turned the request down, or could not be reached." };

  const described = describe.title ? describe : await cachedDescription(mediaType, tmdbId);
  const facts = {
    overseerrStatus: "requested",
    requestedById: userId,
    title: described.title ?? undefined,
    poster: described.poster ?? undefined,
  };
  await db.availability.upsert({
    where: { mediaType_tmdbId: { mediaType, tmdbId } },
    create: { mediaType, tmdbId, ...facts },
    update: facts,
  });
  return { ok: true };
}
