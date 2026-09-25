import "server-only";
import { randomUUID } from "node:crypto";
import type { HomeUser } from "./plex-tv";

/**
 * The gap between "plex.tv says who signed in" and "which of the household is
 * it?". Choosing a profile needs the owner's token (it is what plex.tv trades
 * for a profile's own), so it is held here, on the server, for ten minutes,
 * and the browser gets only an opaque handle in a cookie. A Plex token is a
 * password by another name and never goes near a cookie, an address or a form.
 *
 * In memory on purpose: a sign-in halfway through that outlives a restart
 * should start again, not find a stale token waiting.
 */

export const HANDOFF_COOKIE = "trekker_plex_choice";
export const HANDOFF_TTL_S = 10 * 60;

type Handoff = { ownerToken: string; users: HomeUser[]; expiresAt: number };

const g = globalThis as unknown as { trekkerPlexHandoff?: Map<string, Handoff> };
const store = (g.trekkerPlexHandoff ??= new Map<string, Handoff>());

function sweep(now = Date.now()) {
  for (const [handle, entry] of store) if (entry.expiresAt < now) store.delete(handle);
}

export function startHandoff(ownerToken: string, users: HomeUser[]): string {
  sweep();
  const handle = randomUUID();
  store.set(handle, { ownerToken, users, expiresAt: Date.now() + HANDOFF_TTL_S * 1000 });
  return handle;
}

export function readHandoff(handle: string | undefined | null): Handoff | null {
  if (!handle) return null;
  const entry = store.get(handle);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(handle);
    return null;
  }
  return entry;
}

/** Spent once a profile is signed into, so the token cannot seat somebody at a second one. */
export function endHandoff(handle: string | undefined | null) {
  if (handle) store.delete(handle);
}
