/**
 * The signing key for session tokens: `AUTH_SECRET`, the same variable and the
 * same bytes as the current app, so its cookies verify here unchanged.
 *
 * Resolved lazily, because `next build` imports the module graph and a throw at
 * import time would break every build made without the production secret.
 *
 * Not marked server-only: the proxy imports it too. Nothing here is reachable
 * from a client component.
 */

const PLACEHOLDER = "change-me-to-a-long-random-string-in-production";
const MIN_LENGTH = 32;

let cached: string | null = null;

/**
 * Proxy and server actions are bundled separately, so a module-level fallback
 * would give each its own key in development and every sign-in would bounce.
 * The process-wide global is shared by both.
 */
const devGlobal = globalThis as unknown as { __trekkerDevSecret?: string };

export function authSecretProblem(value = process.env.AUTH_SECRET): string | null {
  const secret = value?.trim();
  if (!secret) return "AUTH_SECRET is not set";
  if (secret === PLACEHOLDER) return "AUTH_SECRET is still the example value";
  if (secret.length < MIN_LENGTH) {
    return `AUTH_SECRET is ${secret.length} characters; it needs at least ${MIN_LENGTH}`;
  }
  return null;
}

export function authSecret(): string {
  if (cached) return cached;

  const problem = authSecretProblem();
  if (!problem) {
    cached = process.env.AUTH_SECRET!.trim();
    return cached;
  }

  // A clean checkout should run. The cost is that a restart signs you out.
  if (process.env.NODE_ENV === "development") {
    if (!devGlobal.__trekkerDevSecret) {
      devGlobal.__trekkerDevSecret = crypto.randomUUID() + crypto.randomUUID();
      console.warn(`${problem}. Using a throwaway key; restarting the dev server signs you out.`);
    }
    return devGlobal.__trekkerDevSecret;
  }

  throw new Error(`${problem}.`);
}

export function authSecretBytes(): Uint8Array {
  return new TextEncoder().encode(authSecret());
}
