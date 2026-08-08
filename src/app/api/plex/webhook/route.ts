import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logPlexScrobble } from "@/lib/plex-scrobble";
import { checkLimit, recordFailure, type Limit } from "@/lib/rate-limit";

/**
 * Plex's webhook, which fires the moment something is scrobbled — the instant
 * alternative to waiting for the next sync.
 *
 * Set it up under **Plex → Settings → Webhooks** (Plex Pass only) pointing at:
 *
 *   https://your-trekker/api/plex/webhook?key=<PLEX_WEBHOOK_SECRET>
 *
 * Plex sends `multipart/form-data` with a JSON `payload` field, and offers no
 * way to add a header — hence the secret in the query string. Without
 * PLEX_WEBHOOK_SECRET set the endpoint refuses everything, because it writes to
 * people's history on the strength of an unauthenticated POST.
 */

export const dynamic = "force-dynamic";

/**
 * A brake on guessing the secret, counting only *failures* — Plex's own
 * traffic never touches it, so a busy evening of scrobbles cannot trip it.
 * One global bucket rather than per-IP: the secret is the thing under attack,
 * and behind a reverse proxy the address is often the proxy anyway. If a guess
 * spree does lock the endpoint, a scrobble missed during the window is not
 * lost — the ten-minute history sync picks it up.
 */
const WEBHOOK_LIMIT: Limit = { attempts: 10, windowMs: 15 * 60 * 1000 };
const LIMIT_KEY = "plex-webhook:key";

/**
 * Constant-time, via digests so unequal lengths cannot short-circuit either.
 * A query-string secret is already the weaker shape (Plex offers no header),
 * so the comparison should not leak anything more about it.
 */
function safeEqual(given: string, secret: string) {
  return timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(secret).digest(),
  );
}

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
    year?: number;
  };
};

export async function POST(request: Request) {
  const secret = process.env.PLEX_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "PLEX_WEBHOOK_SECRET is not set" }, { status: 503 });
  }

  const gate = checkLimit(LIMIT_KEY, WEBHOOK_LIMIT);
  if (!gate.allowed) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !safeEqual(key, secret)) {
    recordFailure(LIMIT_KEY, WEBHOOK_LIMIT);
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  let payload: Payload | null = null;
  try {
    const form = await request.formData();
    const raw = form.get("payload");
    payload = typeof raw === "string" ? (JSON.parse(raw) as Payload) : null;
  } catch {
    return NextResponse.json({ error: "Unreadable payload" }, { status: 400 });
  }

  // `media.scrobble` is Plex's "this counts as watched". The play/pause/resume
  // events are noise for our purposes.
  if (payload?.event !== "media.scrobble") return NextResponse.json({ ignored: true });

  const account = payload.Account;
  if (!account?.id && !account?.title) return NextResponse.json({ ignored: true });

  // Whose viewing is this? Same matching as the now-playing card: plex.tv
  // account id first, username second — which is what makes a Plex Home child
  // profile work, since it has no id of its own to sign in with.
  const viewer = await db.user.findFirst({
    where: {
      OR: [
        ...(account.id !== undefined ? [{ plexAccountId: String(account.id) }] : []),
        ...(account.title ? [{ plexUsername: account.title }] : []),
      ],
    },
    select: { id: true },
  });

  if (!viewer) return NextResponse.json({ ignored: "no matching profile" });

  const meta = payload.Metadata;
  if (!meta) return NextResponse.json({ ignored: true });

  const logged = await logPlexScrobble(viewer.id, {
    type: meta.type === "episode" ? "episode" : "movie",
    ratingKey: meta.ratingKey ?? null,
    grandparentRatingKey: meta.grandparentRatingKey ?? keyOf(meta.grandparentKey),
    title: meta.title ?? "Untitled",
    showTitle: meta.grandparentTitle ?? null,
    year: meta.year ?? null,
    seasonNumber: meta.parentIndex ?? null,
    episodeNumber: meta.index ?? null,
    watchedAt: new Date(),
  }).catch((error) => {
    console.error("Plex webhook could not log a scrobble", error);
    return false;
  });

  return NextResponse.json({ logged });
}

/** `/library/metadata/1234` → `1234`. */
function keyOf(key: string | undefined) {
  if (!key) return null;
  const match = /(\d+)\s*$/.exec(key);
  return match ? match[1] : null;
}
