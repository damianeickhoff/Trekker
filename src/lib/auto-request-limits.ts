/**
 * The ceiling on how much one auto-request run may ask for.
 *
 * In its own module because the panel that offers the setting is a client
 * component and `auto-request.ts` is `server-only` — same reasoning as
 * `accents.ts` and `smart-filters.ts`. A limit the interface cannot read is a
 * limit the interface will contradict.
 *
 * Twenty is generous for a nightly top-up and small enough that a mistake is
 * recoverable by hand.
 */
export const AUTO_REQUEST_MAX = 20;

/** Clamps whatever was stored, or typed, into something defensible. */
export function requestCap(stored: number) {
  if (!Number.isFinite(stored)) return 1;
  return Math.min(AUTO_REQUEST_MAX, Math.max(1, Math.floor(stored)));
}
