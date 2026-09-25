import "server-only";

/**
 * Failed sign-ins per key, in memory. One process serves a household, so a map
 * is enough; it forgets on restart, which only ever errs towards letting
 * someone try again.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const failures = new Map<string, number[]>();

function recent(key: string, now: number) {
  const kept = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (kept.length) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

/** Milliseconds until another attempt is allowed, or 0 when it is allowed now. */
export function retryIn(key: string, now = Date.now()): number {
  const list = recent(key, now);
  if (list.length < MAX_FAILURES) return 0;
  return WINDOW_MS - (now - list[0]);
}

export function recordFailure(key: string, now = Date.now()) {
  failures.set(key, [...recent(key, now), now]);
}

export function clearFailures(key: string) {
  failures.delete(key);
}
