/**
 * The current app's webhook address, so a Plex server already pointed at it
 * keeps logging when this app takes over. `PLEX_WEBHOOK_SECRET` is honoured
 * beside the secret the Plex sheet shows.
 */
export { POST } from "../../webhooks/plex/route";

export const dynamic = "force-dynamic";
