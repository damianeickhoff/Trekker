import "server-only";
import webpush from "web-push";
import { db } from "./db";

/**
 * Web push, per device. A subscription belongs to a browser, not an account,
 * so a phone can be on while the laptop is not; each one is a
 * `PushSubscription` row.
 *
 * Needs a VAPID key pair (`npx web-push generate-vapid-keys`) in
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and a contact in
 * `VAPID_SUBJECT`. Without them push stays off rather than half working, and
 * Settings says so.
 */

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

/** Read at request time, not inlined at build, so one image serves any instance's keys. */
export function vapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
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

export type PushMessage = {
  title: string;
  body: string;
  /** Where a tap lands. */
  url: string;
  /** Collapses repeats of one subject in the tray. */
  tag?: string;
};

/**
 * The pushes that have a switch of their own in Settings (`User.notifyFriends`,
 * `User.notifyChallenges`, and Settings › News's two, `notifyNews` and
 * `notifyNewsPeople`). The morning push has none beyond the device's own:
 * turning push on for a device is asking for it.
 */
export type PushTopic = "friends" | "challenges" | "news" | "news-people";

async function wants(userId: string, topic: PushTopic) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { notifyFriends: true, notifyChallenges: true, notifyNews: true, notifyNewsPeople: true },
  });
  if (!user) return false;
  if (topic === "friends") return user.notifyFriends;
  if (topic === "challenges") return user.notifyChallenges;
  return topic === "news-people" ? user.notifyNewsPeople : user.notifyNews;
}

/**
 * To every device someone has, unless the message has a topic they turned off. A 404 or 410 means the push service has
 * retired that subscription for good, so the row goes at once; anything else
 * is logged and left, since a service having a bad minute is not a reason to
 * forget a device.
 */
export async function sendToUser(userId: string, message: PushMessage, topic?: PushTopic) {
  if (!pushConfigured()) return { sent: 0, failed: 0, retired: 0 };
  if (topic && !(await wants(userId, topic))) return { sent: 0, failed: 0, retired: 0 };
  configure();
  const devices = await db.pushSubscription.findMany({ where: { userId } });
  const payload = JSON.stringify(message);
  let sent = 0;
  let failed = 0;
  let retired = 0;
  for (const device of devices) {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, {
        TTL: 12 * 60 * 60,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        retired += 1;
        await db.pushSubscription.delete({ where: { id: device.id } }).catch(() => undefined);
      } else {
        console.error("push failed", status ?? error);
      }
    }
  }
  return { sent, failed, retired };
}
