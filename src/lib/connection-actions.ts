"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { isAdmin } from "./admin";
import { getCurrentUser } from "./auth";
import { db } from "./db";
import { schedulePlexSync, scheduleAvailabilitySweep } from "./refresh";
import { forgetSeerrUsers, normaliseUrl, verifySeerr } from "./seerr";
import { verifyServer } from "./plex-server";
import { getServers, PlexAuthError } from "./plex-tv";
import { defaultTraktClientId, fetchTraktBundle, TraktError, verifyTrakt } from "./trakt";
import { startImport } from "./trakt-import";
import { openSecret, sealSecret } from "./token-vault";
import { viewingChanged } from "./viewing";
import { rotateWebhookSecret, webhookSecret, type WebhookKind } from "./webhook-secrets";

/*
 * The Connections sheets' actions. The Plex server and Overseerr are the
 * instance's, so only the admin may change them (checked here, not trusted
 * from the page); signing in with Plex, Sync now and Trakt are each person's
 * own. No token ever travels to the browser: the server picker is sent names
 * and addresses, and linking looks the chosen server up again here.
 */

export type Outcome<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function signedIn() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

async function admin() {
  const user = await signedIn();
  return (await isAdmin(user.id)) ? user : null;
}

const NOT_ADMIN = { ok: false as const, error: "Only the admin can change the server connections." };

// ---------------------------------------------------------------------------
// Plex: the server

export type ServerChoice = { name: string; machineId: string; owned: boolean; connections: { uri: string; local: boolean; relay: boolean }[] };

async function adminPlexToken(userId: string) {
  const row = await db.user.findUnique({ where: { id: userId }, select: { plexAuthToken: true } });
  return openSecret(row?.plexAuthToken);
}

/** The servers the admin's Plex account reaches, without their tokens. */
export async function plexServerChoices(): Promise<Outcome<{ servers: ServerChoice[] }>> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  const token = await adminPlexToken(user.id);
  if (!token) return { ok: false, error: "Sign in with Plex first: the servers come from your Plex account." };
  try {
    const servers = await getServers(token);
    // Everything but the token, which never leaves the server.
    const choices = servers.map((s) => ({ name: s.name, machineId: s.machineId, owned: s.owned, connections: s.connections }));
    return { ok: true, servers: choices };
  } catch (error) {
    return { ok: false, error: error instanceof PlexAuthError ? error.message : "plex.tv did not answer." };
  }
}

/**
 * Links the chosen server at the chosen address: looked up again for its
 * token, proved by asking the address who it is, and stored only when the
 * answer is that same server. Then every mark is checked at once, behind the
 * answer, rather than at 04:00.
 */
export async function linkPlexServer(machineId: string, uri: string): Promise<Outcome<{ name: string }>> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  if (typeof machineId !== "string" || typeof uri !== "string" || uri.length > 300) return { ok: false, error: "Choose a server and an address." };
  const token = await adminPlexToken(user.id);
  if (!token) return { ok: false, error: "Sign in with Plex first." };
  let server;
  try {
    server = (await getServers(token)).find((s) => s.machineId === machineId);
  } catch (error) {
    return { ok: false, error: error instanceof PlexAuthError ? error.message : "plex.tv did not answer." };
  }
  if (!server) return { ok: false, error: "That server is not on your Plex account any more." };
  const url = uri.trim().replace(/\/+$/, "");
  const found = await verifyServer(url, server.accessToken);
  if (!found) return { ok: false, error: "Nothing answered at that address. Try another of the server's addresses." };
  if (found.machineId !== server.machineId) return { ok: false, error: "A different server answered at that address." };

  await db.user.update({
    where: { id: user.id },
    data: { plexUrl: url, plexToken: sealSecret(server.accessToken), plexMachineId: server.machineId },
  });
  after(() => scheduleAvailabilitySweep().catch((error) => console.error("availability after linking Plex failed", error)));
  refresh();
  return { ok: true, name: found.name };
}

export async function testPlexServer(): Promise<Outcome<{ name: string }>> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  const row = await db.user.findUnique({ where: { id: user.id }, select: { plexUrl: true, plexToken: true, plexMachineId: true } });
  const token = openSecret(row?.plexToken);
  if (!row?.plexUrl || !token) return { ok: false, error: "No server is linked." };
  const found = await verifyServer(row.plexUrl, token);
  if (!found) return { ok: false, error: `Nothing answered at ${row.plexUrl}.` };
  if (row.plexMachineId && found.machineId !== row.plexMachineId) return { ok: false, error: "A different server answered at that address." };
  return { ok: true, name: found.name };
}

export async function unlinkPlexServer(): Promise<Outcome> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  await db.user.update({ where: { id: user.id }, data: { plexUrl: null, plexToken: null, plexMachineId: null } });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Plex: the person

/** Reads this person's Plex history now, watched flags included. */
export async function syncPlexNow(): Promise<Outcome<{ logged: number; already: number; unmatched: string[] }>> {
  const user = await signedIn();
  const outcome = await schedulePlexSync(user.id, { library: true }).catch(() => ({ ok: false as const, error: "The sync stopped. Try again." }));
  if (!outcome.ok) return outcome;
  if (outcome.summary.logged > 0) viewingChanged(user.id);
  refresh();
  return { ok: true, logged: outcome.summary.logged, already: outcome.summary.already, unmatched: outcome.summary.unmatched };
}

/**
 * Takes Plex off this account. Only where there is a password to sign in with
 * instead: an account made through Plex would be locked out by it.
 */
export async function unlinkPlexAccount(): Promise<Outcome> {
  const user = await signedIn();
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row?.passwordHash) return { ok: false, error: "This account signs in with Plex, so Plex stays linked." };
  await db.user.update({ where: { id: user.id }, data: { plexAccountId: null, plexAuthToken: null, plexUsername: null } });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Webhook secrets

export async function webhookSecretFor(kind: WebhookKind): Promise<Outcome<{ secret: string }>> {
  if (!(await admin())) return NOT_ADMIN;
  const secret = await webhookSecret(kind === "plex" ? "plex" : "seerr");
  return secret ? { ok: true, secret } : { ok: false, error: "No accounts yet." };
}

export async function newWebhookSecret(kind: WebhookKind): Promise<Outcome<{ secret: string }>> {
  if (!(await admin())) return NOT_ADMIN;
  const secret = await rotateWebhookSecret(kind === "plex" ? "plex" : "seerr");
  return secret ? { ok: true, secret } : { ok: false, error: "No accounts yet." };
}

// ---------------------------------------------------------------------------
// Overseerr

export async function linkSeerr(url: string, apiKey: string): Promise<Outcome<{ version: string }>> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  const address = typeof url === "string" ? url.trim() : "";
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!address || address.length > 300) return { ok: false, error: "Enter the address Overseerr answers at." };
  if (!key || key.length > 200) return { ok: false, error: "Enter its API key (Overseerr → Settings → General)." };
  const check = await verifySeerr(address, key);
  if (!check.ok) return check;
  await db.user.update({ where: { id: user.id }, data: { seerrUrl: normaliseUrl(address), seerrApiKey: sealSecret(key) } });
  forgetSeerrUsers();
  refresh();
  return { ok: true, version: check.version };
}

export async function testSeerr(): Promise<Outcome<{ version: string }>> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  const row = await db.user.findUnique({ where: { id: user.id }, select: { seerrUrl: true, seerrApiKey: true } });
  const key = openSecret(row?.seerrApiKey);
  if (!row?.seerrUrl || !key) return { ok: false, error: "No Overseerr is linked." };
  return verifySeerr(row.seerrUrl, key);
}

export async function unlinkSeerr(): Promise<Outcome> {
  const user = await admin();
  if (!user) return NOT_ADMIN;
  await db.user.update({ where: { id: user.id }, data: { seerrUrl: null, seerrApiKey: null } });
  forgetSeerrUsers();
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Trakt

/** The username and client id, checked against Trakt before either is kept. */
export async function saveTrakt(username: string, clientId: string): Promise<Outcome> {
  const user = await signedIn();
  const name = typeof username === "string" ? username.trim() : "";
  const own = typeof clientId === "string" ? clientId.trim() : "";
  if (!name || name.length > 100) return { ok: false, error: "Enter your Trakt username." };
  const id = own || defaultTraktClientId();
  if (!id) return { ok: false, error: "Enter a Trakt API client id: this Trakt has none of its own." };
  try {
    await verifyTrakt(name, id);
  } catch (error) {
    return { ok: false, error: error instanceof TraktError ? error.message : "Trakt could not be reached." };
  }
  await db.user.update({ where: { id: user.id }, data: { traktUsername: name, traktClientId: own ? sealSecret(own) : null } });
  refresh();
  return { ok: true };
}

export async function unlinkTrakt(): Promise<Outcome> {
  const user = await signedIn();
  await db.user.update({ where: { id: user.id }, data: { traktUsername: null, traktClientId: null } });
  refresh();
  return { ok: true };
}

/** Starts the import from the linked profile, behind the answer; Home shows how far it has got. */
export async function importFromTrakt(): Promise<Outcome> {
  const user = await signedIn();
  const row = await db.user.findUnique({ where: { id: user.id }, select: { traktUsername: true, traktClientId: true } });
  const clientId = openSecret(row?.traktClientId) ?? defaultTraktClientId();
  if (!row?.traktUsername || !clientId) return { ok: false, error: "Link your Trakt profile first." };
  const username = row.traktUsername;
  void startImport(user.id, "trakt", () => fetchTraktBundle(username, clientId));
  refresh();
  return { ok: true };
}
