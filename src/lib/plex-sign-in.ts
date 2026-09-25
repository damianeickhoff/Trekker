import "server-only";
import { completePlexSignIn } from "./plex-accounts";
import { claimPin, PlexAuthError } from "./plex-tv";

/**
 * The return leg of signing in with Plex as one decision: where the browser
 * goes next, and whether it goes signed in or holding a Plex Home handoff.
 * The route turns it into a redirect and cookies; the tests run it against a
 * stubbed plex.tv.
 */

/** Carries the pending PIN between the two legs. */
export const PIN_COOKIE = "trekker_plex_pin";

/**
 * The address Plex should send the browser back to, from the forwarded
 * headers where there are some: a self-hosted instance is normally behind a
 * proxy, and the request's own URL there is the internal one.
 */
export function publicOrigin(request: { headers: Headers; nextUrl: { origin: string; protocol: string } }) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export type PinDecision = {
  /** A path on this origin. */
  to: string;
  /** Sign this account in. */
  signIn?: string;
  /** Hold this Plex Home handoff for the picker. */
  handoff?: string;
};

const withMessage = (path: string, message: string) => `${path}?plex=${encodeURIComponent(message)}`;

export async function finishPlexSignIn(
  pinId: number | null,
  viewerId: string | null,
  claim: Parameters<typeof claimPin>[1] = {},
): Promise<PinDecision> {
  const back = viewerId ? "/settings/connections" : "/login";
  if (!pinId) return { to: withMessage(back, "That sign-in request expired. Try again.") };

  try {
    const state = await claimPin(pinId, claim);
    if (state.status === "expired") return { to: withMessage(back, "That sign-in request expired. Try again.") };
    if (state.status === "pending") return { to: withMessage(back, "Plex did not confirm the sign-in. Try again.") };

    const outcome = await completePlexSignIn(state.token, viewerId);
    switch (outcome.kind) {
      case "taken":
        return { to: withMessage("/settings/connections", "That Plex account is already linked to someone else here.") };
      case "linked":
        return { to: "/settings/connections?plex=linked" };
      case "choose":
        return { to: "/login/profile", handoff: outcome.handle };
      case "signed-in":
        return { to: "/", signIn: outcome.userId };
    }
  } catch (error) {
    return { to: withMessage(back, error instanceof PlexAuthError ? error.message : "Could not reach plex.tv") };
  }
}
