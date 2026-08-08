import "server-only";
import { createHash } from "node:crypto";
import { authSecret } from "./secrets";

/**
 * Signing in with Plex, via plex.tv's PIN flow.
 *
 * Trekker asks plex.tv for a PIN, sends the browser to Plex's own sign-in page
 * with that PIN attached, and Plex sends the browser back. The PIN can then be
 * exchanged for an auth token, which identifies the account. No Plex password
 * ever reaches this application, and no Plex subscription is involved.
 */

const BASE = "https://plex.tv/api/v2";
const PRODUCT = "Trekker";

/** Carries the pending PIN between the two halves of the flow. */
export const PIN_COOKIE = "trekker_plex_pin";

/**
 * The address Plex should send the browser back to. Taken from the forwarded
 * headers where they exist: a self-hosted instance is normally behind a proxy,
 * and the request URL there is the internal one.
 */
export function callbackOrigin(request: {
  headers: Headers;
  nextUrl: { origin: string; protocol: string };
}) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    request.nextUrl.protocol.replace(":", "");

  return `${proto}://${host}`;
}

export class PlexAuthError extends Error {}

/**
 * plex.tv keys PINs and tokens to a client identifier, so it has to be stable
 * for the life of the install. Derived from the session secret rather than
 * stored, which keeps it out of the database and unique per deployment.
 */
export function clientIdentifier() {
  const configured = process.env.PLEX_CLIENT_ID?.trim();
  if (configured) return configured;

  // Through the same accessor as the session key rather than reading the
  // variable directly, so the two cannot disagree about what "unset" means —
  // and so an unset secret is refused here too instead of quietly deriving an
  // identifier every deployment in the world would share.
  return `trekker-${createHash("sha256").update(authSecret()).digest("hex").slice(0, 24)}`;
}

function headers() {
  return {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Client-Identifier": clientIdentifier(),
  };
}

export type PlexPin = { id: number; code: string };

export async function createPin(): Promise<PlexPin> {
  const res = await fetch(`${BASE}/pins?strong=true`, {
    method: "POST",
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new PlexAuthError(`plex.tv refused the request (${res.status})`);

  const data = (await res.json()) as { id?: number; code?: string };
  if (typeof data.id !== "number" || typeof data.code !== "string") {
    throw new PlexAuthError("plex.tv returned an unexpected response");
  }

  return { id: data.id, code: data.code };
}

/** The page the browser is sent to. Plex returns it to `forwardUrl` when done. */
export function authUrl(pin: PlexPin, forwardUrl: string) {
  const params = new URLSearchParams({
    clientID: clientIdentifier(),
    code: pin.code,
    forwardUrl,
    "context[device][product]": PRODUCT,
  });

  return `https://app.plex.tv/auth#?${params.toString()}`;
}

/** The token once the user has approved, or null while they have not. */
export async function claimPin(id: number): Promise<string | null> {
  const res = await fetch(`${BASE}/pins/${id}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 404) throw new PlexAuthError("That sign-in request has expired");
  if (!res.ok) throw new PlexAuthError(`plex.tv refused the request (${res.status})`);

  const data = (await res.json()) as { authToken?: string | null };
  return data.authToken ?? null;
}

export type PlexAccount = { id: string; email: string; username: string };

export async function getAccount(token: string): Promise<PlexAccount> {
  const res = await fetch(`${BASE}/user`, {
    headers: { ...headers(), "X-Plex-Token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new PlexAuthError("Could not read that Plex account");

  const data = (await res.json()) as {
    id?: number | string;
    email?: string;
    username?: string;
    title?: string;
  };

  if (data.id === undefined || !data.email) {
    throw new PlexAuthError("That Plex account has no email address on it");
  }

  return {
    id: String(data.id),
    email: data.email.trim().toLowerCase(),
    username: (data.username || data.title || data.email.split("@")[0]).trim(),
  };
}
