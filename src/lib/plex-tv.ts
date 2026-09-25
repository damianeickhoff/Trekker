import "server-only";
import { createHash } from "node:crypto";
import { authSecret } from "./secrets";

/**
 * plex.tv: signing in, the Plex Home behind an account, and the servers an
 * account can reach. The current app's calls, in one place, each with a
 * timeout and nothing retried except the PIN claim below.
 *
 * Signing in is plex.tv's PIN flow. Trekker asks for a PIN, sends the browser
 * to Plex's own page with it, and Plex sends the browser back; the PIN is then
 * exchanged for the account's token. No Plex password reaches this app.
 */

const V2 = "https://plex.tv/api/v2";
/** The old XML API, kept for the Home switch alone, where it is the likelier of the two to answer. */
const V1 = "https://plex.tv/api";
const PRODUCT = "Trekker";

export class PlexAuthError extends Error {}

/**
 * plex.tv keys PINs and tokens to a client identifier, so it must be stable for
 * the life of the install. Derived from the session secret rather than stored,
 * which keeps it unique per deployment: the current app's derivation, so the
 * two apps are the same client to plex.tv.
 */
export function clientIdentifier() {
  const configured = process.env.PLEX_CLIENT_ID?.trim();
  if (configured) return configured;
  return `trekker-${createHash("sha256").update(authSecret()).digest("hex").slice(0, 24)}`;
}

function headers(token?: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Product": PRODUCT,
    "X-Plex-Client-Identifier": clientIdentifier(),
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

async function call(url: string, init: RequestInit = {}) {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new PlexAuthError("Could not reach plex.tv");
  }
}

// ---------------------------------------------------------------------------
// The PIN

export type PlexPin = { id: number; code: string };

export async function createPin(): Promise<PlexPin> {
  const res = await call(`${V2}/pins?strong=true`, { method: "POST", headers: headers() });
  if (!res.ok) throw new PlexAuthError(`plex.tv refused the request (${res.status})`);
  const data = (await res.json()) as { id?: number; code?: string };
  if (typeof data.id !== "number" || typeof data.code !== "string") {
    throw new PlexAuthError("plex.tv returned an unexpected response");
  }
  return { id: data.id, code: data.code };
}

/** Plex's own sign-in page, which returns the browser to `forwardUrl` when done. */
export function authUrl(pin: PlexPin, forwardUrl: string) {
  const params = new URLSearchParams({
    clientID: clientIdentifier(),
    code: pin.code,
    forwardUrl,
    "context[device][product]": PRODUCT,
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

/** Where one PIN stands: waiting for the person, approved with a token, or gone. */
export type PinState = { status: "pending" } | { status: "approved"; token: string } | { status: "expired" };

export async function checkPin(id: number): Promise<PinState> {
  const res = await call(`${V2}/pins/${id}`, { headers: headers() });
  if (res.status === 404) return { status: "expired" };
  if (!res.ok) throw new PlexAuthError(`plex.tv refused the request (${res.status})`);
  const data = (await res.json()) as { authToken?: string | null; expiresIn?: number };
  if (data.authToken) return { status: "approved", token: data.authToken };
  // An unclaimed PIN past its life answers with nothing left to wait for.
  if (typeof data.expiresIn === "number" && data.expiresIn <= 0) return { status: "expired" };
  return { status: "pending" };
}

/**
 * The poll. Plex usually writes the token before it sends the browser back,
 * but not always, so the return leg asks a few times, a moment apart, before
 * giving up. Expired ends it at once: waiting cannot bring a PIN back.
 */
export async function claimPin(
  id: number,
  { attempts = 8, gapMs = 750, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<PinState> {
  let state: PinState = { status: "pending" };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(gapMs);
    state = await checkPin(id);
    if (state.status !== "pending") return state;
  }
  return state;
}

// ---------------------------------------------------------------------------
// Who signed in

export type PlexAccount = { id: string; email: string; username: string };

export async function getAccount(token: string): Promise<PlexAccount> {
  const res = await call(`${V2}/user`, { headers: headers(token) });
  if (!res.ok) throw new PlexAuthError("Could not read that Plex account");
  const data = (await res.json()) as { id?: number | string; email?: string; username?: string; title?: string };
  if (data.id === undefined || !data.email) throw new PlexAuthError("That Plex account has no email address on it");
  return {
    id: String(data.id),
    email: data.email.trim().toLowerCase(),
    username: (data.username || data.title || data.email.split("@")[0]).trim(),
  };
}

// ---------------------------------------------------------------------------
// Plex Home

export type HomeUser = {
  /** plex.tv account id. Managed profiles have one too. */
  id: string;
  uuid: string | null;
  /** Their name in the Home: always present. */
  title: string;
  /** Only a full plex.tv member of the Home has these. */
  username: string | null;
  email: string | null;
  thumb: string | null;
  /** The Home's owner. */
  admin: boolean;
  /** A managed profile, with no plex.tv login of its own. */
  restricted: boolean;
  /** Has a Plex Home PIN, which switching to it needs. */
  protected: boolean;
};

/** plex.tv writes booleans as 0/1 as often as true/false. */
const flag = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function toHomeUser(raw: Record<string, unknown>): HomeUser | null {
  if (raw.id === undefined || raw.id === null) return null;
  const title = text(raw.title) ?? text(raw.friendlyName) ?? text(raw.username);
  if (!title) return null;
  return {
    id: String(raw.id),
    uuid: text(raw.uuid),
    title,
    username: text(raw.username),
    email: text(raw.email)?.toLowerCase() ?? null,
    thumb: text(raw.thumb),
    admin: flag(raw.admin),
    restricted: flag(raw.restricted),
    protected: flag(raw.protected),
  };
}

/**
 * Everyone in the Home this token belongs to, or nobody. Forgiving on
 * purpose: no Home, an odd answer and plex.tv being down all mean "nothing to
 * choose between", and the sign-in carries on as for a single person.
 */
export async function getHomeUsers(token: string): Promise<HomeUser[]> {
  let payload: unknown;
  try {
    const res = await call(`${V2}/home/users`, { headers: headers(token) });
    if (!res.ok) return [];
    payload = await res.json();
  } catch {
    return [];
  }
  // Seen both ways round: a bare array, and one under `users`.
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { users?: unknown })?.users)
      ? (payload as { users: unknown[] }).users
      : [];
  return list
    .map((raw) => (raw && typeof raw === "object" ? toHomeUser(raw as Record<string, unknown>) : null))
    .filter((u): u is HomeUser => u !== null);
}

/**
 * Exchanges the owner's token for one belonging to a profile in their Home,
 * which is what every Plex app does when a face is tapped on its "who is
 * watching" screen. The PIN is the profile's own Plex Home PIN.
 */
export async function switchToHomeUser(ownerToken: string, user: Pick<HomeUser, "id" | "uuid">, pin?: string): Promise<string> {
  const query = pin ? `?pin=${encodeURIComponent(pin)}` : "";
  const attempts = [
    { url: `${V2}/home/users/${user.uuid ?? user.id}/switch${query}`, json: true },
    { url: `${V1}/home/users/${user.id}/switch${query}`, json: false },
  ];
  let refused = false;
  for (const attempt of attempts) {
    let res: Response;
    try {
      res = await call(attempt.url, { method: "POST", headers: headers(ownerToken) });
    } catch {
      continue;
    }
    // A wrong PIN is an answer, not a reason to try the other endpoint.
    if (res.status === 401 || res.status === 403) {
      refused = true;
      continue;
    }
    if (!res.ok) continue;
    const body = await res.text();
    if (attempt.json) {
      try {
        const data = JSON.parse(body) as { authToken?: string; authenticationToken?: string };
        const token = data.authToken ?? data.authenticationToken;
        if (token) return token;
      } catch {
        // Some deployments answer with XML whatever was asked for; the match below reads it.
      }
    }
    const matched = /auth(?:entication)?Token="([^"]+)"/i.exec(body);
    if (matched) return matched[1];
  }
  throw new PlexAuthError(refused ? "That PIN was not accepted by Plex." : "Plex would not switch to that profile. Try again.");
}

// ---------------------------------------------------------------------------
// Servers

export type PlexServer = {
  name: string;
  machineId: string;
  /** The server's own token for this account: what the instance stores. */
  accessToken: string;
  owned: boolean;
  /** Addresses to reach it by, local ones first, relays last. */
  connections: { uri: string; local: boolean; relay: boolean }[];
};

type Resource = {
  name?: string;
  provides?: string;
  clientIdentifier?: string;
  accessToken?: string;
  owned?: boolean;
  connections?: { uri?: string; local?: boolean; relay?: boolean }[];
};

async function resources(token: string): Promise<Resource[]> {
  const res = await call(`${V2}/resources?includeHttps=1&includeRelay=1`, { headers: headers(token) });
  if (!res.ok) throw new PlexAuthError(`plex.tv refused the request (${res.status})`);
  const list = (await res.json()) as Resource[];
  return Array.isArray(list) ? list : [];
}

/** The Plex Media Servers this account can reach, owned first, for the admin's server picker. */
export async function getServers(token: string): Promise<PlexServer[]> {
  return (await resources(token))
    .filter((r) => (r.provides ?? "").split(",").includes("server") && r.clientIdentifier && r.accessToken)
    .map((r) => ({
      name: r.name ?? "Plex",
      machineId: r.clientIdentifier!,
      accessToken: r.accessToken!,
      owned: r.owned === true,
      connections: (r.connections ?? [])
        .filter((c): c is { uri: string; local?: boolean; relay?: boolean } => typeof c.uri === "string")
        .map((c) => ({ uri: c.uri, local: c.local === true, relay: c.relay === true }))
        .sort((a, b) => Number(a.relay) - Number(b.relay) || Number(b.local) - Number(a.local)),
    }))
    .sort((a, b) => Number(b.owned) - Number(a.owned));
}

/** The machine ids this token can see, for whether someone has access to the instance's server. */
export async function reachableServers(token: string): Promise<string[]> {
  return (await resources(token)).flatMap((r) => (r.clientIdentifier ? [r.clientIdentifier] : []));
}
