import "server-only";
import { db } from "./db";
import { gate } from "./gates";
import { openSecret } from "./token-vault";

/**
 * Overseerr (and Jellyseerr, which answers the same API): the instance's
 * connection, checking one before it is stored, and who each Trekker account
 * is over there. Everything fails soft; an instance that does not answer is
 * "not connected", never a broken page.
 */

export type SeerrConnection = { url: string; apiKey: string };

export function normaliseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** The admin's row holds it, as it holds the Plex server. */
export async function seerrConnection(): Promise<SeerrConnection | null> {
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { seerrUrl: true, seerrApiKey: true } });
  const apiKey = openSecret(admin?.seerrApiKey);
  return admin?.seerrUrl && apiKey ? { url: admin.seerrUrl, apiKey } : null;
}

export async function seerrFetch<T>(conn: SeerrConnection, path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    await gate.take("overseerr");
    const res = await fetch(normaliseUrl(conn.url) + path, {
      ...init,
      headers: { "X-Api-Key": conn.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type SeerrCheck = { ok: true; version: string } | { ok: false; error: string };

/**
 * Whether an address and key work, before either is stored. The status route
 * answers without a key, so the key is proved separately on `auth/me`, which
 * refuses a wrong one: a sheet that said "Connected" to a bad key would only
 * fail later, on somebody's Request.
 */
export async function verifySeerr(url: string, apiKey: string): Promise<SeerrCheck> {
  const conn = { url, apiKey };
  const status = await seerrFetch<{ version?: string }>(conn, "/api/v1/status");
  if (!status) return { ok: false, error: "Nothing answered at that address." };
  const me = await seerrFetch<{ id?: number }>(conn, "/api/v1/auth/me");
  if (!me?.id) return { ok: false, error: "That address answered, but refused the API key." };
  return { ok: true, version: status.version ?? "unknown" };
}

type SeerrUser = { id?: number; plexId?: number | null; email?: string | null; plexUsername?: string | null };

const USERS_KEEP_MS = 10 * 60 * 1000;
const g = globalThis as unknown as { trekkerSeerrUsers?: { at: number; users: SeerrUser[] } };

/** Overseerr's accounts, kept ten minutes: requests come in bursts (Request all, the nightly pass). */
async function seerrUsers(conn: SeerrConnection): Promise<SeerrUser[]> {
  const kept = g.trekkerSeerrUsers;
  if (kept && Date.now() - kept.at < USERS_KEEP_MS) return kept.users;
  const page = await seerrFetch<{ results?: SeerrUser[] }>(conn, "/api/v1/user?take=500&skip=0");
  const users = page?.results ?? [];
  if (page) g.trekkerSeerrUsers = { at: Date.now(), users };
  return users;
}

export function forgetSeerrUsers() {
  g.trekkerSeerrUsers = undefined;
}

/**
 * Who this person is on Overseerr: the account made from the same Plex
 * account (Overseerr signs people in with Plex, and keeps the plex.tv id),
 * then the same email. Null when they have none there, and the request goes in
 * as the API key's owner, which is how every request went before.
 */
export async function seerrUserFor(
  conn: SeerrConnection,
  who: { plexAccountId: string | null; email: string | null; plexUsername?: string | null },
): Promise<number | null> {
  if (!who.plexAccountId && !who.email) return null;
  const users = await seerrUsers(conn);
  const match =
    users.find((u) => who.plexAccountId && u.plexId !== null && u.plexId !== undefined && String(u.plexId) === who.plexAccountId) ??
    users.find((u) => who.email && u.email?.toLowerCase() === who.email.toLowerCase()) ??
    users.find((u) => who.plexUsername && u.plexUsername?.toLowerCase() === who.plexUsername.toLowerCase());
  return match?.id ?? null;
}
