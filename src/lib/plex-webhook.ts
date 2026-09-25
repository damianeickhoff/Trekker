import "server-only";
import { ratingKeyFrom, serverConnection } from "./plex-server";
import { logPlexReport, viewerFor, type ReportOutcome } from "./plex-scrobble";
import { checkWebhookSecret } from "./webhook-secrets";

/**
 * Plex's webhook (Plex Pass), which fires the moment something is scrobbled:
 * Plex → Settings → Webhooks, pointed at `/api/webhooks/plex?key=<secret>`,
 * the address the Plex sheet shows. Plex offers no way to set a header, hence
 * the secret in the query string. It posts `multipart/form-data` with the
 * event as JSON in a `payload` field; a plain JSON body is read too.
 *
 * Only `media.scrobble` counts ("this was watched"); play, pause and the rest
 * are noise here. What cannot be matched, to an account or to a TMDB title, is
 * acknowledged and dropped, because Plex retries nothing useful and a 4xx
 * would only fill its log.
 *
 * Pure of Next, so the route stays a line and the tests call this directly.
 */

type Payload = {
  event?: string;
  Account?: { id?: number | string; title?: string };
  Metadata?: {
    type?: string;
    ratingKey?: string;
    grandparentRatingKey?: string;
    grandparentKey?: string;
    grandparentTitle?: string;
    title?: string;
    parentIndex?: number;
    index?: number;
    Guid?: { id?: string }[];
  };
};

export type WebhookAnswer = {
  status: number;
  body: Record<string, unknown>;
  /** Whose history changed, so the route can expire their cached rails. */
  userId?: string;
};

async function readPayload(request: Request): Promise<Payload | null> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await request.json()) as Payload;
  const form = await request.formData();
  const raw = form.get("payload");
  return typeof raw === "string" ? (JSON.parse(raw) as Payload) : null;
}

export async function handlePlexWebhook(request: Request, now = new Date()): Promise<WebhookAnswer> {
  const key = new URL(request.url).searchParams.get("key");
  const check = await checkWebhookSecret("plex", key);
  if (check === "slow-down") return { status: 429, body: { error: "Too many attempts" } };
  if (check === "wrong") return { status: 401, body: { error: "Not authorised" } };

  let payload: Payload | null;
  try {
    payload = await readPayload(request);
  } catch {
    return { status: 400, body: { error: "Unreadable payload" } };
  }
  if (payload?.event !== "media.scrobble") return { status: 200, body: { ignored: "not a scrobble" } };

  const meta = payload.Metadata;
  if (!meta || (meta.type !== "movie" && meta.type !== "episode")) return { status: 200, body: { ignored: "not a film or an episode" } };

  const userId = await viewerFor(payload.Account);
  if (!userId) return { status: 200, body: { ignored: "no matching account" } };

  const { outcome } = await logPlexReport(
    userId,
    {
      type: meta.type,
      ratingKey: meta.ratingKey ?? null,
      grandparentRatingKey: meta.grandparentRatingKey ?? ratingKeyFrom(meta.grandparentKey),
      guids: meta.Guid ?? null,
      title: meta.title ?? "Untitled",
      showTitle: meta.grandparentTitle ?? null,
      seasonNumber: meta.parentIndex ?? null,
      episodeNumber: meta.index ?? null,
      watchedAt: now,
    },
    await serverConnection(),
  ).catch((error): { outcome: ReportOutcome } => {
    console.error("Plex webhook could not log a scrobble", error);
    return { outcome: "skipped" };
  });

  return { status: 200, body: { outcome }, userId: outcome === "logged" ? userId : undefined };
}
