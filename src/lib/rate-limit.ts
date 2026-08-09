import "server-only";

/**
 * A brake on repeated failures, for sign-in and anything else worth guessing at.
 *
 * In memory, on `globalThis`, exactly like `import-jobs.ts` — and for the same
 * reason it is the right call rather than a compromise: this is a self-hosted
 * instance running one process. A restart clears the counters, which matters
 * far less than it sounds, because bcrypt at cost 10 is itself the real brake
 * on how fast anybody can try.
 *
 * Keyed on the **email** rather than the IP. A household behind one NAT shares
 * an address, so an IP-keyed lock would let one person's fat fingers lock
 * everyone else out — and behind a reverse proxy the address is often the proxy
 * anyway. The email is the thing actually under attack, and locking it costs
 * nobody but the attacker and the one account they are aiming at.
 */

type Bucket = { count: number; resetAt: number };

const globalForLimit = globalThis as unknown as { __trekkerRateLimit?: Map<string, Bucket> };
const buckets = (globalForLimit.__trekkerRateLimit ??= new Map<string, Bucket>());

/** Nothing here is worth unbounded memory. Oldest go first when it fills. */
const MAX_KEYS = 5000;

export type Limit = { attempts: number; windowMs: number };

/** Five tries a quarter of an hour: generous for a typo, useless for a list. */
export const LOGIN_LIMIT: Limit = { attempts: 5, windowMs: 15 * 60 * 1000 };

/**
 * Ten comments in five minutes. Well past a lively conversation, well short of
 * anything that could fill a title page — this is a household, so the brake is
 * against a stuck finger and a runaway script rather than against a stranger.
 */
export const COMMENT_LIMIT: Limit = { attempts: 10, windowMs: 5 * 60 * 1000 };

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Still full of live entries: drop the oldest rather than grow for ever.
  // Insertion order is Map's own, and an entry that is about to expire is the
  // least valuable thing to lose.
  if (buckets.size > MAX_KEYS) {
    const excess = buckets.size - MAX_KEYS;
    let dropped = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++dropped >= excess) break;
    }
  }
}

/**
 * Whether this key may try again, and how long until it may.
 *
 * Read-only: it does not count the attempt, because at the point of asking, the
 * attempt has not failed yet. Call `recordFailure` when it does.
 */
export function checkLimit(key: string, limit: Limit = LOGIN_LIMIT) {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return { allowed: true, retryInMs: 0 };

  if (bucket.count < limit.attempts) return { allowed: true, retryInMs: 0 };
  return { allowed: false, retryInMs: bucket.resetAt - now };
}

export function recordFailure(key: string, limit: Limit = LOGIN_LIMIT) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return;
  }

  bucket.count += 1;
}

/**
 * The same counter, under a name that is true for the other kind of caller.
 *
 * Sign-in counts *failures*, because a correct password is not an attack. A
 * comment has no failure to count — every post is a real one, and what is being
 * limited is the rate rather than the wrongness. Same bucket, same window; only
 * the word would have lied.
 */
export const recordEvent = recordFailure;

/** A success clears the slate — the password was right, so nothing was guessed. */
export function clearLimit(key: string) {
  buckets.delete(key);
}

/** "in 4 minutes", for a message somebody has to read while annoyed. */
export function describeWait(ms: number) {
  const minutes = Math.ceil(ms / 60000);
  return minutes <= 1 ? "in a minute" : `in ${minutes} minutes`;
}

/** Test seam: the counters are process-global and would leak between cases. */
export function resetAllLimits() {
  buckets.clear();
}
