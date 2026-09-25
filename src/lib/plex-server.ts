import "server-only";
import { db } from "./db";
import { gate } from "./gates";
import { openSecret } from "./token-vault";

/**
 * The instance's Plex Media Server: the connection on the admin's row, the
 * one call that proves an address and token reach it, and turning a library
 * item into the TMDB title it is, which the webhook, the now-playing poll and
 * the history sync all need. Everything fails soft; an unreachable server is
 * "not on Plex", never a broken page.
 */

export type PlexConnection = { url: string; token: string; machineId: string | null };

export function normalisePlexUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** The server as the admin linked it, with the server's own token. */
export async function serverConnection(): Promise<PlexConnection | null> {
  const admin = await db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { plexUrl: true, plexToken: true, plexMachineId: true },
  });
  const token = openSecret(admin?.plexToken);
  return admin?.plexUrl && token ? { url: admin.plexUrl, token, machineId: admin.plexMachineId } : null;
}

export async function plexGet<T>(
  conn: Pick<PlexConnection, "url" | "token">,
  path: string,
  params: Record<string, string> = {},
  timeoutMs = 6000,
): Promise<T | null> {
  try {
    const target = new URL(normalisePlexUrl(conn.url) + path);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    target.searchParams.set("X-Plex-Token", conn.token);
    await gate.take("plex");
    const res = await fetch(target, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Whether an address and token reach a server, and which one: its machine id and name. */
export async function verifyServer(url: string, token: string) {
  const data = await plexGet<{ MediaContainer?: { machineIdentifier?: string; friendlyName?: string } }>(
    { url, token },
    "/identity",
    {},
    4000,
  );
  const id = data?.MediaContainer?.machineIdentifier;
  return id ? { machineId: id, name: data?.MediaContainer?.friendlyName ?? "Plex" } : null;
}

/** `tmdb://603` among an item's guids, the only id this app can use. */
export function tmdbFromGuids(guids: { id?: string }[] | undefined | null): number | null {
  for (const g of guids ?? []) {
    const m = /^tmdb:\/\/(\d+)$/.exec(g.id ?? "");
    if (m) return Number(m[1]);
  }
  return null;
}

/** `/library/metadata/1234` to `1234`: history rows name the show by path, not by key. */
export function ratingKeyFrom(key: string | null | undefined): string | null {
  if (!key) return null;
  const m = /(\d+)\s*$/.exec(key);
  return m ? m[1] : null;
}

const g = globalThis as unknown as { trekkerPlexIds?: Map<string, number | null> };
/** Library keys already resolved in this process. A key's match changes only when the library is re-matched. */
const known = (g.trekkerPlexIds ??= new Map<string, number | null>());

/**
 * Which TMDB title a library item is. The daily job's own rows first (an
 * `Availability` row names the item it found for a title), then the item's
 * guids on the server, asked as the server: the question is about the
 * library, not about whoever watched it. Null for an item the modern agents
 * never matched, which callers skip rather than guess at.
 */
export async function tmdbIdForKey(
  conn: Pick<PlexConnection, "url" | "token"> | null,
  ratingKey: string,
  mediaType: "movie" | "tv",
): Promise<number | null> {
  const memo = `${mediaType}:${ratingKey}`;
  if (known.has(memo)) return known.get(memo)!;
  const row = await db.availability.findFirst({ where: { mediaType, plexRatingKey: ratingKey }, select: { tmdbId: true } });
  if (row) {
    known.set(memo, row.tmdbId);
    return row.tmdbId;
  }
  if (!conn) return null;
  const data = await plexGet<{ MediaContainer?: { Metadata?: { Guid?: { id?: string }[] }[] } }>(
    conn,
    `/library/metadata/${ratingKey}`,
    { includeGuids: "1" },
  );
  // An unanswered call is not remembered: the server may be back in a minute.
  if (!data) return null;
  const id = tmdbFromGuids(data.MediaContainer?.Metadata?.[0]?.Guid);
  known.set(memo, id);
  return id;
}

/** For tests, which change the library under the same keys. */
export function forgetPlexIds() {
  known.clear();
}
