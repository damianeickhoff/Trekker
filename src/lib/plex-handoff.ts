import "server-only";
import { randomUUID } from "node:crypto";
import type { HomeUser } from "./plex-home";

/**
 * The gap between "Plex says who signed in" and "and which of the household is
 * it?".
 *
 * Picking a profile needs the owner's Plex token — that is what plex.tv will
 * exchange for a profile's own — so something has to hold it across the two
 * requests the picker takes. It is held here, on the server, and the browser
 * gets nothing but an opaque handle in a cookie. A Plex auth token is a
 * password by another name; it has no business being in a cookie, a URL or a
 * form field, and the whole point of this module is that it never is.
 *
 * In memory, and gone in ten minutes. This is a sign-in that is halfway
 * through: if it does not finish in the next minute or two it is not going to,
 * and if the process restarts underneath it the right answer is to start again
 * rather than to find a stale token waiting.
 */

export const HANDOFF_COOKIE = "trekker_plex_choice";

/** Long enough to read a list of faces and type a PIN, and no longer. */
const TTL_MS = 10 * 60 * 1000;

type Handoff = {
  ownerToken: string;
  /** Who is on offer. Read from plex.tv once, at the top of the flow. */
  users: HomeUser[];
  expiresAt: number;
};

const store = ((globalThis as { __trekkerPlexHandoff?: Map<string, Handoff> })
  .__trekkerPlexHandoff ??= new Map<string, Handoff>());

function sweep() {
  const now = Date.now();
  for (const [handle, entry] of store) {
    if (entry.expiresAt < now) store.delete(handle);
  }
}

export function startHandoff(ownerToken: string, users: HomeUser[]): string {
  sweep();

  const handle = randomUUID();
  store.set(handle, { ownerToken, users, expiresAt: Date.now() + TTL_MS });
  return handle;
}

export function readHandoff(handle: string | undefined): Handoff | null {
  if (!handle) return null;

  const entry = store.get(handle);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    store.delete(handle);
    return null;
  }

  return entry;
}

/**
 * Spends the handoff. Called once a profile has actually been signed into, so a
 * token cannot be reused to seat somebody at a second profile afterwards.
 */
export function endHandoff(handle: string | undefined) {
  if (handle) store.delete(handle);
}
