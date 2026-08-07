import "server-only";
import { clientIdentifier, PlexAuthError } from "./plex-auth";

/**
 * Plex Home: the several people behind one plex.tv login.
 *
 * A Home has an owner with a real plex.tv account, and beside them any number
 * of *managed* profiles — a partner, a brother, the kids — who have no login of
 * their own. They watch by picking themselves on the Plex app after the owner's
 * account has signed in.
 *
 * Which is exactly what Trekker was missing. Signing in with Plex asks plex.tv
 * "who is this?", and for everyone in a Home the honest answer is the owner —
 * so the whole household arrived at the owner's Trekker profile and logged
 * their viewing into it. The question Plex's own apps ask second, and this
 * module exists to ask, is "and which of you is it?".
 *
 * Answering it means a second token. plex.tv will exchange the owner's token
 * for one scoped to a chosen Home profile, which is what every Plex client does
 * when you tap a face on the "who's watching" screen — and that token then
 * identifies the profile rather than the owner, which is all the rest of the
 * app needs.
 */

const V2 = "https://plex.tv/api/v2";
/**
 * The old XML API, kept as a fallback for the switch alone.
 *
 * The v2 endpoint is the one to use and the one documented; the v1 route is
 * what every long-standing Plex library still calls, so it is the more likely
 * of the two to be there on any given day. Falling back to it costs one request
 * on a path that has already failed, and the only thing needed out of its XML
 * is a single attribute.
 */
const V1 = "https://plex.tv/api";

export type HomeUser = {
  /** plex.tv account id. Managed profiles have one of these too. */
  id: string;
  uuid: string | null;
  /** Their name in the Home — "Sarah", "the kids". Always present. */
  title: string;
  /** Only a full plex.tv member of the Home has these. */
  username: string | null;
  email: string | null;
  thumb: string | null;
  /** The Home's owner. There is exactly one. */
  admin: boolean;
  /** A managed profile: no plex.tv login of its own. */
  restricted: boolean;
  /** Has a Plex Home PIN, which must be given to switch to it. */
  protected: boolean;
};

function headers(token: string) {
  return {
    Accept: "application/json",
    "X-Plex-Product": "Trekker",
    "X-Plex-Client-Identifier": clientIdentifier(),
    "X-Plex-Token": token,
  };
}

/** plex.tv writes booleans as 0/1 as often as true/false. */
function flag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function text(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

type RawHomeUser = Record<string, unknown>;

function toHomeUser(raw: RawHomeUser): HomeUser | null {
  const id = raw.id;
  if (id === undefined || id === null) return null;

  const title = text(raw.title) ?? text(raw.friendlyName) ?? text(raw.username);
  if (!title) return null;

  return {
    id: String(id),
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
 * Everyone in the Home this token owns, or an empty list when it owns none.
 *
 * Deliberately forgiving. An account that is not in a Home at all, an instance
 * where plex.tv answers something unexpected, plex.tv being down — all of those
 * mean "no profiles to choose between", and the only consequence is that the
 * sign-in carries on exactly as it did before this module existed. Failing a
 * sign-in over a picker that was never needed would be much the worse trade.
 */
export async function getHomeUsers(token: string): Promise<HomeUser[]> {
  let payload: unknown;

  try {
    const response = await fetch(`${V2}/home/users`, {
      headers: headers(token),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return [];
    payload = await response.json();
  } catch {
    return [];
  }

  // Seen both ways round: a bare array, and an object with the array under
  // `users`. Neither costs anything to accept.
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { users?: unknown })?.users)
      ? ((payload as { users: unknown[] }).users)
      : [];

  return list
    .map((raw) => (raw && typeof raw === "object" ? toHomeUser(raw as RawHomeUser) : null))
    .filter((user): user is HomeUser => user !== null);
}

/**
 * Exchanges the owner's token for one belonging to a profile in their Home.
 *
 * The PIN is the profile's own Plex Home PIN, not the owner's password, and is
 * only asked for by profiles that have one set. A profile *without* one can be
 * entered by anybody holding the owner's Plex login — that is Plex's own trust
 * model, not something invented here, and it is worth knowing if the point of
 * separate profiles is separation rather than convenience.
 */
export async function switchToHomeUser(
  ownerToken: string,
  user: Pick<HomeUser, "id" | "uuid">,
  pin?: string,
): Promise<string> {
  const query = pin ? `?pin=${encodeURIComponent(pin)}` : "";

  // v2 keys on the uuid where there is one; v1 has only ever known the id.
  const attempts = [
    { url: `${V2}/home/users/${user.uuid ?? user.id}/switch${query}`, json: true },
    { url: `${V1}/home/users/${user.id}/switch${query}`, json: false },
  ];

  let refused = false;

  for (const attempt of attempts) {
    let response: Response;
    try {
      response = await fetch(attempt.url, {
        method: "POST",
        headers: headers(ownerToken),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      continue;
    }

    // A wrong PIN is an answer, not a reason to try the other endpoint.
    if (response.status === 401 || response.status === 403) {
      refused = true;
      continue;
    }
    if (!response.ok) continue;

    const body = await response.text();

    if (attempt.json) {
      try {
        const data = JSON.parse(body) as { authToken?: string; authenticationToken?: string };
        const token = data.authToken ?? data.authenticationToken;
        if (token) return token;
      } catch {
        // Fall through to the attribute match below: some deployments answer
        // this endpoint with XML whatever the Accept header asked for.
      }
    }

    // The v1 answer is a `<user …>` element, and the one thing wanted out of it
    // is a single attribute — which is not worth an XML parser.
    const matched = /auth(?:entication)?Token="([^"]+)"/i.exec(body);
    if (matched) return matched[1];
  }

  throw new PlexAuthError(
    refused
      ? "That PIN was not accepted by Plex."
      : "Plex would not switch to that profile. Try again.",
  );
}
