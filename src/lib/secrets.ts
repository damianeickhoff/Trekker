import "server-only";

/**
 * The signing key, resolved once and never guessed.
 *
 * What this replaces is a fallback string — `"dev-only-insecure-secret-…"` —
 * that let the app boot happily with `AUTH_SECRET` unset and issue thirty-day
 * sessions signed with a key printed in the repository. Anyone who could reach
 * the instance could forge a cookie for any account. Docker enforced the
 * variable; `next start` did not.
 *
 * Resolved **lazily** rather than at module scope, because `next build` imports
 * the whole module graph: a throw at import time would break every build that
 * does not happen to have the production secret to hand. Nothing calls this
 * until a request needs a token signed or verified, by which point the process
 * is genuinely serving traffic.
 *
 * `src/instrumentation.ts` calls `assertAuthSecret()` at boot so a
 * misconfigured deployment fails on start rather than on somebody's first
 * sign-in.
 */

/** Shipped in `.env.example`, and therefore the string people paste unchanged. */
const PLACEHOLDER = "change-me-to-a-long-random-string-in-production";

/**
 * Short enough to brute-force offline is the only bar that matters here, and
 * 32 characters of anything random clears it comfortably.
 */
const MIN_LENGTH = 32;

let cached: string | null = null;
let devFallback: string | null = null;

export class MisconfiguredSecret extends Error {}

/**
 * Why the current value is unusable, or null when it is fine. Split out so the
 * boot check can report the reason without duplicating the rules.
 */
export function authSecretProblem(value = process.env.AUTH_SECRET): string | null {
  const secret = value?.trim();

  if (!secret) return "AUTH_SECRET is not set";
  if (secret === PLACEHOLDER) {
    return "AUTH_SECRET is still the example value from .env.example";
  }
  if (secret.length < MIN_LENGTH) {
    return `AUTH_SECRET is ${secret.length} characters; it needs at least ${MIN_LENGTH}`;
  }

  return null;
}

/** How to fix it, appended to whatever went wrong. */
export const SECRET_ADVICE =
  "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"";

/**
 * The secret, as a string.
 *
 * In development a random key is generated once per process instead of
 * throwing, so `npm run dev` works out of the box on a clean checkout — the
 * cost is that restarting signs you out, which is a fair trade and is said out
 * loud. Anywhere else this is fatal, because a running instance with no secret
 * is the thing being prevented.
 */
export function authSecret(): string {
  if (cached) return cached;

  const problem = authSecretProblem();
  if (!problem) {
    cached = process.env.AUTH_SECRET!.trim();
    return cached;
  }

  if (process.env.NODE_ENV === "development") {
    if (!devFallback) {
      devFallback = crypto.randomUUID() + crypto.randomUUID();
      console.warn(
        `\n⚠ ${problem}.\n  Using a throwaway key for this dev session — every restart will sign you out.\n  ${SECRET_ADVICE}\n`,
      );
    }
    return devFallback;
  }

  throw new MisconfiguredSecret(`${problem}. ${SECRET_ADVICE}`);
}

/** The same, encoded for `jose`. */
export function authSecretBytes(): Uint8Array {
  return new TextEncoder().encode(authSecret());
}

/**
 * Boot-time check. Throws with the reason, for `instrumentation.ts` to report
 * and exit on — outside development, where the fallback above applies.
 */
export function assertAuthSecret() {
  if (process.env.NODE_ENV === "development") return;

  const problem = authSecretProblem();
  if (problem) throw new MisconfiguredSecret(`${problem}. ${SECRET_ADVICE}`);
}
