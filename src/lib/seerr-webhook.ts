import "server-only";
import { db } from "./db";
import type { WebhookAnswer } from "./plex-webhook";
import { checkWebhookSecret } from "./webhook-secrets";

/**
 * Overseerr's webhook (Settings → Notifications → Webhook), pointed at
 * `/api/webhooks/overseerr` with the secret from the Overseerr sheet as its
 * Authorization header. It is what makes a request's clock and a title's
 * arrival show the moment they happen rather than after the next daily sweep:
 * the `Availability` row is written here, and when a title arrives the bell
 * of whoever asked for it, and of anyone with it on their watchlist, says so.
 *
 * Overseerr's default JSON template is what is read: `notification_type`,
 * `subject`, `image`, and the `media` and `request` objects. Anything it does
 * not describe (issues, a test) is acknowledged and left alone.
 */

type Payload = {
  notification_type?: string;
  subject?: string;
  image?: string;
  media?: { media_type?: string; tmdbId?: string | number; status?: string } | null;
  request?: { requestedBy_email?: string; requestedBy_username?: string } | null;
};

const REQUESTED = new Set(["MEDIA_PENDING", "MEDIA_APPROVED", "MEDIA_AUTO_APPROVED", "MEDIA_AUTO_REQUESTED"]);
const WITHDRAWN = new Set(["MEDIA_DECLINED", "MEDIA_FAILED"]);

export type SeerrAnswer = WebhookAnswer & {
  /** The title whose row changed, for the route to have the daily job's check run on it now. */
  title?: { mediaType: "movie" | "tv"; tmdbId: number; title: string };
  /** Who to tell it has arrived. */
  notify?: string[];
};

/** "Dune (2021)" is Overseerr's subject; the year is the title page's to show. */
function titleFrom(subject: string | undefined) {
  const s = subject?.trim();
  return s ? s.replace(/\s*\(\d{4}\)\s*$/, "") : null;
}

/** `https://image.tmdb.org/t/p/w600_and_h900_bestv2/abc.jpg` to `/abc.jpg`, the form every row here keeps. */
function posterFrom(image: string | undefined) {
  const m = image ? /image\.tmdb\.org\/t\/p\/[^/]+(\/[^/?#]+)$/.exec(image) : null;
  return m ? m[1] : null;
}

/** Overseerr sends the value as it was typed, so "Bearer x" and plain "x" are both taken. */
function presented(request: Request) {
  const header = request.headers.get("authorization")?.trim();
  if (header) return header.replace(/^Bearer\s+/i, "");
  return new URL(request.url).searchParams.get("key");
}

async function requesterOf(payload: Payload) {
  const email = payload.request?.requestedBy_email?.trim().toLowerCase();
  const name = payload.request?.requestedBy_username?.trim().toLowerCase();
  if (!email && !name) return null;
  if (email) {
    const byEmail = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (byEmail) return byEmail.id;
  }
  if (!name) return null;
  const people = await db.user.findMany({ where: { plexUsername: { not: null } }, select: { id: true, plexUsername: true } });
  return people.find((p) => p.plexUsername!.toLowerCase() === name)?.id ?? null;
}

export async function handleSeerrWebhook(request: Request, now = new Date()): Promise<SeerrAnswer> {
  const check = await checkWebhookSecret("seerr", presented(request));
  if (check === "slow-down") return { status: 429, body: { error: "Too many attempts" } };
  if (check === "wrong") return { status: 401, body: { error: "Not authorised" } };

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return { status: 400, body: { error: "Unreadable payload" } };
  }

  const kind = payload.notification_type ?? "";
  if (kind === "TEST_NOTIFICATION") return { status: 200, body: { ok: true, test: true } };

  const mediaType = payload.media?.media_type;
  const tmdbId = Number(payload.media?.tmdbId);
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { status: 200, body: { ignored: "no title" } };
  }
  const arrived = kind === "MEDIA_AVAILABLE";
  if (!arrived && !REQUESTED.has(kind) && !WITHDRAWN.has(kind)) return { status: 200, body: { ignored: kind || "unknown" } };

  const where = { mediaType_tmdbId: { mediaType, tmdbId } };
  const [existing, requester] = await Promise.all([
    db.availability.findUnique({ where, select: { overseerrStatus: true, requestedById: true, availableAt: true, title: true } }),
    requesterOf(payload),
  ]);
  const title = titleFrom(payload.subject);
  const poster = posterFrom(payload.image);

  // A decline takes back a request, never an arrival Overseerr reported earlier.
  const status = arrived ? "available" : REQUESTED.has(kind) ? "requested" : existing?.overseerrStatus === "available" ? "available" : "none";
  const data = {
    overseerrStatus: status,
    // Kept when this event names nobody we know: the request filed here said who.
    requestedById: requester ?? existing?.requestedById ?? null,
    ...(title ? { title } : {}),
    ...(poster ? { poster } : {}),
    // The first arrival is the news; a repeat for a second season is not a second headline.
    ...(arrived && !existing?.availableAt ? { availableAt: now } : {}),
  };
  await db.availability.upsert({ where, create: { mediaType, tmdbId, ...data }, update: data });

  let notify: string[] | undefined;
  if (arrived && !existing?.availableAt) {
    const watchers = await db.watchlistItem.findMany({ where: { mediaType, tmdbId }, select: { userId: true } });
    notify = [...new Set([...(data.requestedById ? [data.requestedById] : []), ...watchers.map((w) => w.userId)])];
  }

  return {
    status: 200,
    body: { ok: true, status },
    title: { mediaType, tmdbId, title: title ?? existing?.title ?? "" },
    notify,
  };
}
