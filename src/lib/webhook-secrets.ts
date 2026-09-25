import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { recordFailure, retryIn } from "./rate-limit";
import { openSecret, sealSecret } from "./token-vault";

/**
 * The secrets the two webhooks are called with. One per instance each, kept
 * sealed on the admin's row beside the connection it belongs to, shown in the
 * Manage sheet, and made the first time that sheet asks for it: nothing to
 * set in the environment, and a new one is one press away if the old one
 * leaks. Without a secret the webhook refuses everything, since both write to
 * people's history or the instance's rows on an unauthenticated POST.
 */

export type WebhookKind = "plex" | "seerr";

const COLUMN = { plex: "plexWebhookSecret", seerr: "seerrWebhookSecret" } as const;

async function adminRow() {
  return db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, plexWebhookSecret: true, seerrWebhookSecret: true },
  });
}

/** URL-safe on purpose: Plex's secret rides in the address, where a `&` or `#` would be cut off. */
function newSecret() {
  return randomBytes(24).toString("base64url");
}

/** The secret, made and stored on first ask. Null only on an instance with no accounts. */
export async function webhookSecret(kind: WebhookKind): Promise<string | null> {
  const admin = await adminRow();
  if (!admin) return null;
  const stored = openSecret(admin[COLUMN[kind]]);
  if (stored) return stored;
  const made = newSecret();
  await db.user.update({ where: { id: admin.id }, data: { [COLUMN[kind]]: sealSecret(made) } });
  return made;
}

export async function rotateWebhookSecret(kind: WebhookKind): Promise<string | null> {
  const admin = await adminRow();
  if (!admin) return null;
  const made = newSecret();
  await db.user.update({ where: { id: admin.id }, data: { [COLUMN[kind]]: sealSecret(made) } });
  return made;
}

/** Constant time, through digests so unequal lengths cannot short-circuit either. */
function same(given: string, secret: string) {
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(secret).digest());
}

export type SecretCheck = "ok" | "wrong" | "slow-down";

/**
 * Checks what a webhook was called with. Failures count towards a brake on
 * guessing, one bucket per webhook rather than per address, because behind a
 * reverse proxy the address is the proxy's; the service's own calls never
 * fail, so a busy evening cannot trip it. Plex also takes the current app's
 * `PLEX_WEBHOOK_SECRET`, so its webhook, pasted once into Plex, keeps working
 * when this app takes over.
 */
export async function checkWebhookSecret(kind: WebhookKind, given: string | null | undefined): Promise<SecretCheck> {
  const bucket = `webhook:${kind}`;
  if (retryIn(bucket) > 0) return "slow-down";
  const admin = await adminRow();
  const candidates = [
    openSecret(admin?.[COLUMN[kind]]),
    kind === "plex" ? process.env.PLEX_WEBHOOK_SECRET?.trim() || null : null,
  ].filter((s): s is string => Boolean(s));
  if (given && candidates.some((s) => same(given, s))) return "ok";
  recordFailure(bucket);
  return "wrong";
}
