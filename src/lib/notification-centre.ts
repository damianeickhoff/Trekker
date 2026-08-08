import "server-only";
import { cache } from "react";
import { ACHIEVEMENTS_BY_ID } from "./achievements/catalogue";
import { avatarUrl } from "./avatar";
import { CHALLENGES_BY_ID, challengesFor, monthName, periodKey } from "./challenges/catalogue";
import { db } from "./db";

/**
 * The bell in the header: things that happened while you were away and are
 * still waiting on you.
 *
 * Nothing here is stored as a notification. An outstanding friend request *is*
 * a pending `Friendship`; a new badge *is* an `UnlockedAchievement`. Deriving
 * them means the list cannot drift from what is true — accept a request and the
 * notification stops existing on its own, with no second record to remember to
 * clean up, and no way to end up announcing something that has been undone.
 *
 * Only "have I seen this" needs storing, which is what `NotificationRead` is.
 * Read items stay in the list rather than vanishing, because a friend request
 * you have read is still a friend request you have not answered — being read is
 * not the same as being dealt with. Nothing disappears until the thing behind it
 * is actually resolved.
 */

export type NotificationKind =
  | "friend-request"
  | "achievement"
  | "challenge"
  | "recommendation";

export type NotificationItem = {
  /** Stable across reloads: what "mark as read" is recorded against. */
  key: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  at: Date;
  read: boolean;
  /** Who it is about, for a friend request. */
  avatar?: string | null;
  /** The achievement's icon name, for a badge. */
  icon?: string;
};

export type Notifications = {
  items: NotificationItem[];
  unread: number;
};

/** How many to carry in the bell. Older badges are on the achievements page. */
const LIMIT = 30;

/**
 * Memoised per request: the layout reads this for the header, and a title page
 * reads it again for the row that stands in for the header on a phone. Four
 * indexed queries either way — but only once.
 */
export const getNotifications = cache(async function getNotifications(
  userId: string,
): Promise<Notifications> {
  const now = new Date();
  const period = periodKey(now);

  const [requests, unlocked, wins, recommendations, readRows] = await Promise.all([
    db.friendship.findMany({
      where: { addresseeId: userId, status: "pending" },
      select: {
        id: true,
        createdAt: true,
        requester: { select: { id: true, name: true, avatarSetAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.unlockedAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: "desc" },
      take: LIMIT,
    }),
    db.challengeRun.findMany({
      where: { userId },
      orderBy: { completedAt: "desc" },
      take: LIMIT,
    }),
    // Only what is still standing: dismissing one sets `dismissedAt` rather
    // than deleting it, so the sender's "already sent" mark survives.
    db.recommendation.findMany({
      where: { toUserId: userId, dismissedAt: null },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: {
        id: true,
        mediaType: true,
        tmdbId: true,
        title: true,
        note: true,
        createdAt: true,
        seenAt: true,
        fromUser: { select: { name: true, avatarSetAt: true, id: true } },
      },
    }),
    db.notificationRead.findMany({
      where: { userId },
      select: { key: true, dismissed: true },
    }),
  ]);

  const read = new Set(readRows.map((row) => row.key));
  const dismissed = new Set(readRows.filter((row) => row.dismissed).map((row) => row.key));
  const items: NotificationItem[] = [];

  for (const rec of recommendations) {
    const key = `rec:${rec.id}`;
    if (dismissed.has(key)) continue;

    items.push({
      key,
      kind: "recommendation",
      title: `${rec.fromUser.name} recommends ${rec.title}`,
      // The sender's own words when there are any, since that is the reason to
      // pay attention to this rather than to the title.
      body: rec.note ?? "Tap to see what it is.",
      href: `/title/${rec.mediaType === "movie" ? "movie" : "tv"}/${rec.tmdbId}`,
      at: rec.createdAt,
      read: read.has(key) || rec.seenAt !== null,
      avatar: avatarUrl(rec.fromUser),
    });
  }

  for (const request of requests) {
    const key = `friend:${request.id}`;
    if (dismissed.has(key)) continue;
    items.push({
      key,
      kind: "friend-request",
      title: `${request.requester.name} wants to be friends`,
      body: "Accept to compare what you have both been watching.",
      href: "/friends",
      at: request.createdAt,
      read: read.has(key),
      avatar: avatarUrl(request.requester),
    });
  }

  for (const row of unlocked) {
    const achievement = ACHIEVEMENTS_BY_ID.get(row.key);
    // A key no longer in the catalogue has nothing to say about itself.
    if (!achievement) continue;

    // The moment is part of the key. Without it a badge that was cleared and
    // earned again reuses the key of the one you already dismissed, so the
    // notification for the second unlock never appears.
    const key = `badge:${row.key}:${row.unlockedAt.getTime()}`;
    if (dismissed.has(key)) continue;
    items.push({
      key,
      kind: "achievement",
      title: `${achievement.name} earned`,
      body: achievement.description,
      // Straight to the badge itself rather than the page it lives on, so
      // there is nothing to hunt for once you get there.
      href: `/achievements?badge=${achievement.id}`,
      at: row.unlockedAt,
      read: read.has(key),
      icon: achievement.icon,
    });
  }

  // "This month's challenges are up." Derived from the calendar like everything
  // else here — the month itself is the event, so there is nothing to write down
  // when it turns over and no job that has to run at midnight on the first.
  const monthKey = `challenges:${period}`;
  if (!dismissed.has(monthKey)) {
    const active = challengesFor(now);
    items.push({
      key: monthKey,
      kind: "challenge",
      title: `${monthName(now)} challenges are up`,
      body: `${active.map((c) => c.name).join(", ")} — worth ${active
        .reduce((sum, c) => sum + c.xp, 0)
        .toLocaleString("en-GB")} bonus XP between them.`,
      href: "/",
      at: new Date(now.getFullYear(), now.getMonth(), 1),
      read: read.has(monthKey),
      icon: "target",
    });
  }

  for (const win of wins) {
    const challenge = CHALLENGES_BY_ID.get(win.key);
    if (!challenge) continue;

    const key = `challenge-won:${win.key}:${win.period}`;
    if (dismissed.has(key)) continue;
    items.push({
      key,
      kind: "challenge",
      title: `${challenge.name} complete`,
      body: `${challenge.description} +${win.xp.toLocaleString("en-GB")} XP.`,
      href: "/achievements",
      at: win.completedAt,
      read: read.has(key),
      icon: challenge.icon,
    });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    items: items.slice(0, LIMIT),
    unread: items.filter((item) => !item.read).length,
  };
});

/**
 * Marks one notification read. Keyed rather than given an id of its own, since
 * the notification is derived and has no row to point at.
 *
 * An upsert, not an insert: reading something twice is not an error, and two
 * tabs open on the same bell should not be able to fail each other.
 */
export async function markRead(userId: string, key: string) {
  if (!key) return;

  await db.notificationRead
    .upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key },
      update: {},
    })
    .catch(() => undefined);
}

export async function markAllRead(userId: string) {
  const { items } = await getNotifications(userId);
  const unread = items.filter((item) => !item.read);
  if (unread.length === 0) return;

  await db.notificationRead
    .createMany({ data: unread.map((item) => ({ userId, key: item.key })) })
    .catch(() => undefined);
}

/**
 * Clears the list — the notifications go away rather than sitting there read.
 *
 * The things behind them are untouched: an unanswered friend request cleared
 * from here is still waiting on the friends page, and a badge is still on the
 * achievements page. This only says "stop showing me this".
 */
export async function dismissAll(userId: string) {
  const { items } = await getNotifications(userId);
  if (items.length === 0) return;

  for (const item of items) {
    await db.notificationRead
      .upsert({
        where: { userId_key: { userId, key: item.key } },
        create: { userId, key: item.key, dismissed: true },
        update: { dismissed: true },
      })
      .catch(() => undefined);
  }
}
