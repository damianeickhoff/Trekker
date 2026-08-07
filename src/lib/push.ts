import "server-only";
import webpush from "web-push";
import { db } from "./db";

/**
 * Web push, for "your show is on tonight".
 *
 * Needs a VAPID key pair, which identifies this instance to the browsers' push
 * services. Generate one once with:
 *
 *   npx web-push generate-vapid-keys
 *
 * and set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT
 * (a mailto: or https: URL). Without them the feature stays switched off
 * rather than half-working.
 */

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

export function publicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? null;
}

let configured = false;

function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:trekker@localhost",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  configured = true;
}

export type Notification = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url?: string;
  /** Collapses repeats of the same subject in the tray. */
  tag?: string;
};

/**
 * Sends to every device a user has registered. Devices whose subscription the
 * push service has retired are deleted — a 404 or 410 means that browser will
 * never accept another message, so keeping the row only slows down every
 * future send.
 */
export async function sendToUser(userId: string, notification: Notification) {
  if (!pushConfigured()) return { sent: 0, failed: 0 };
  configure();

  const devices = await db.pushSubscription.findMany({ where: { userId } });
  const payload = JSON.stringify(notification);

  let sent = 0;
  let failed = 0;

  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: device.id } }).catch(() => undefined);
        } else {
          console.error("Push failed", status, error);
        }
      }
    }),
  );

  return { sent, failed };
}
