import "server-only";
import type { IconName } from "@/components/icon";
import { unstable_cache } from "next/cache";
import { ACHIEVEMENTS_BY_ID } from "./achievements/catalogue";
import { LEVEL_RULES, getLevel } from "./achievements/xp";
import { avatarUrl } from "./avatar";
import { getAgenda, type Landing } from "./calendar";
import { CHALLENGES_BY_ID, challengesFor, periodKey } from "./challenges/catalogue";
import { backgroundFromRow, type BackgroundVariant } from "./background";
import { dailyPoster } from "./background-art";
import { todayKey } from "./dates";
import { db } from "./db";
import { BADGE_XP, formatNumber, type Tier } from "./levels";
import { episodeCode, titleHref } from "./marks";
import { newsFor } from "./news";

/**
 * The bell: what happened while you were away.
 *
 * Nothing here is stored as a notification. A friend request is a pending
 * `Friendship`, a badge is an `UnlockedAchievement`, today's episodes are the
 * calendar, news is `NewsItem` (`lib/news.ts`); so the list cannot disagree with what is
 * true, and answering a request removes its notification with nothing to keep
 * in step. The one thing that cannot be derived is whether it has been seen,
 * which is all `NotificationRead` holds.
 *
 * Worked out at request time from indexed reads, cached sixty seconds per
 * person (`bellTag`), and fetched by the browser after the page has painted,
 * never by a layout. The daily push uses the same words, so the two read as
 * one event.
 */

export type NoteKind =
  | "airing"
  | "friend-request"
  | "recommendation"
  | "badge"
  | "challenge-won"
  | "challenges-up"
  | "news"
  | "auto-request"
  | "arrived";

export type NoteIcon = "bell" | "user" | "sparkle" | "trophy" | "calendar" | "calendarCheck" | "clapperboard" | "clock" | "play";

export type Note = {
  /** Stable across reloads: what a read mark is recorded against. */
  key: string;
  kind: NoteKind;
  title: string;
  body: string;
  href: string;
  /** ISO. */
  at: string;
  read: boolean;
  icon: NoteIcon;
};

export type NewestBadge = {
  key: string;
  name: string;
  icon: IconName;
  description: string;
  tier: Tier;
  /** What it paid towards the level; nothing when it came with an import. */
  xp: number;
  at: string;
};

export type Me = {
  id: string;
  name: string;
  avatar: string | null;
  level: number;
  rank: string;
  xp: number;
  toNextLevel: number;
  percent: number;
  maxed: boolean;
  /** Minutes without input before the screensaver starts itself; 0 is never. The layout's watcher reads it. */
  screensaverIdle: number;
  /** Came in through a Plex Home: the avatar menu offers Switch person. */
  plexHome: boolean;
  /**
   * What stands behind every page, from the account (`lib/background.ts`), with
   * today's poster when it is the artwork: the layer (`BackgroundArt`) reads it
   * from here, the shell's own answer, so it does not change on navigation,
   * and puts the cookie right when the choice was made on another device.
   */
  background: { variant: BackgroundVariant; hue: number; poster: string | null };
};

export type BellData = {
  items: Note[];
  unread: number;
  newestBadge: NewestBadge | null;
  me: Me | null;
  /** News not yet opened (`lib/news.ts`): the sidebar's count beside News. */
  newsUnread: number;
};

/** How many the bell carries. Older badges are on the badges page. */
const LIMIT = 30;

/** How long "now on Plex" stays news after Overseerr said so. */
const ARRIVAL_DAYS = 14;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const bellTag = (userId: string) => `bell:${userId}`;

/** "Minerva Academy S01 · E03 and 4 more": the first thing on, and how many besides. */
export function airingLine(entries: Landing[]): string {
  const first = entries[0];
  const what =
    first.kind === "episode"
      ? `${first.title} ${episodeCode(first.seasonNumber, first.episodeNumber)}`
      : first.kind === "premiere"
        ? `${first.title} premieres`
        : first.kind === "cinema"
          ? `${first.title} in cinemas`
          : `${first.title} streaming`;
  return entries.length > 1 ? `${what} and ${entries.length - 1} more` : what;
}

/** "September’s challenges are up": the bell's words, which the push on the first uses too. */
export function challengesUpLines(now: Date) {
  const trio = challengesFor(now);
  return {
    title: `${MONTHS[now.getMonth()]}’s challenges are up`,
    body: `Three new things, worth ${formatNumber(trio.reduce((sum, c) => sum + c.xp, 0))} XP`,
  };
}

/** Today's arrivals, not yet watched, for the bell and the morning push alike. */
export async function airingToday(userId: string, today = todayKey()) {
  return (await getAgenda(userId, today, today)).filter((e) => !e.watched);
}

/**
 * Every notification, newest first, with its read state. Uncached: this is
 * what the cached bell and the tests call.
 */
export async function deriveNotifications(
  userId: string,
  now = new Date(),
  { everything = false }: { everything?: boolean } = {},
): Promise<Omit<BellData, "me" | "newsUnread">> {
  const period = periodKey(now);
  const today = todayKey(now);

  const [requests, unlocked, wins, recommendations, news, lists, airing, readRows, arrivals] = await Promise.all([
    // (addresseeId, status)
    db.friendship.findMany({
      where: { addresseeId: userId, status: "pending" },
      select: { id: true, createdAt: true, requester: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // (userId, unlockedAt)
    db.unlockedAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: "desc" }, take: LIMIT }),
    // (userId, period)
    db.challengeRun.findMany({ where: { userId }, orderBy: { completedAt: "desc" }, take: LIMIT }),
    // (toUserId, dismissedAt)
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
        fromUser: { select: { name: true } },
      },
    }),
    // News about what they follow: a person's since the follow, a title's while it is in progress or saved.
    newsFor(userId, { take: LIMIT }),
    db.mediaList.findMany({
      where: { userId, kind: "smart", autoRequest: true, autoRequestedAt: { not: null }, autoRequestedCount: { gt: 0 } },
      select: { id: true, name: true, autoRequestedAt: true, autoRequestedCount: true, autoRequestedTitles: true },
    }),
    airingToday(userId, today),
    db.notificationRead.findMany({ where: { userId }, select: { key: true, dismissed: true } }),
    // (availableAt): what Overseerr said arrived lately, instance-wide; a handful of rows.
    db.availability.findMany({
      where: { availableAt: { gte: new Date(now.getTime() - ARRIVAL_DAYS * 24 * 60 * 60 * 1000) } },
      select: { mediaType: true, tmdbId: true, availableAt: true, requestedById: true, title: true },
    }),
  ]);

  // Of those, what this person asked for or keeps on their watchlist.
  const saved = arrivals.length
    ? await db.watchlistItem.findMany({
        where: { userId, OR: arrivals.map((a) => ({ mediaType: a.mediaType, tmdbId: a.tmdbId })) },
        select: { mediaType: true, tmdbId: true, title: true },
      })
    : [];
  const savedTitles = new Map(saved.map((s) => [`${s.mediaType}-${s.tmdbId}`, s.title]));

  const read = new Set(readRows.map((r) => r.key));
  const dismissed = new Set(readRows.filter((r) => r.dismissed).map((r) => r.key));
  const items: Note[] = [];
  const push = (note: Omit<Note, "read">, alsoRead = false) => {
    if (dismissed.has(note.key)) return;
    items.push({ ...note, read: alsoRead || read.has(note.key) });
  };

  if (airing.length > 0) {
    const [y, m, d] = today.split("-").map(Number);
    push({
      key: `airing:${today}`,
      kind: "airing",
      title: "Airing today",
      body: airingLine(airing),
      href: "/calendar",
      at: new Date(y, m - 1, d).toISOString(),
      icon: "bell",
    });
  }

  for (const r of requests) {
    push({
      key: `friend:${r.id}`,
      kind: "friend-request",
      title: `${r.requester.name} wants to be friends`,
      body: "Accept from the friends page",
      href: "/friends",
      at: r.createdAt.toISOString(),
      icon: "user",
    });
  }

  for (const rec of recommendations) {
    push(
      {
        key: `rec:${rec.id}`,
        kind: "recommendation",
        title: `${rec.fromUser.name} recommends ${rec.title}`,
        // Their own words when there are any: that is the reason to look.
        body: rec.note ? `“${rec.note}”` : "Tap to see what it is",
        href: titleHref(rec.mediaType === "tv" ? "tv" : "movie", rec.tmdbId),
        at: rec.createdAt.toISOString(),
        icon: "sparkle",
      },
      rec.seenAt !== null,
    );
  }

  for (const row of unlocked) {
    const a = ACHIEVEMENTS_BY_ID.get(row.key);
    if (!a) continue;
    push({
      // The moment is part of the key: a badge taken back and earned again is news again.
      key: `badge:${row.key}:${row.unlockedAt.getTime()}`,
      kind: "badge",
      title: `Badge earned: ${a.name}`,
      body: a.description,
      href: "/badges",
      at: row.unlockedAt.toISOString(),
      icon: "trophy",
    });
  }

  // The month itself is the event, so nothing has to run at midnight on the first.
  push({
    key: `challenges:${period}`,
    kind: "challenges-up",
    ...challengesUpLines(now),
    href: "/",
    at: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    icon: "calendar",
  });

  for (const win of wins) {
    const c = CHALLENGES_BY_ID.get(win.key);
    if (!c) continue;
    push({
      key: `challenge-won:${win.key}:${win.period}`,
      kind: "challenge-won",
      title: `Challenge complete: ${c.name}`,
      body: `${c.description} +${formatNumber(win.xp)} XP`,
      href: "/",
      at: win.completedAt.toISOString(),
      icon: "calendarCheck",
    });
  }

  for (const n of news) {
    push({
      key: n.key,
      kind: "news",
      title: n.headline,
      body: n.detail,
      href: titleHref(n.mediaType, n.tmdbId),
      at: n.at,
      icon: "clapperboard",
    });
  }

  // A feature that spends somebody's disk overnight must not be silent about it.
  for (const list of lists) {
    const count = list.autoRequestedCount;
    push({
      key: `autorequest:${list.id}:${list.autoRequestedAt!.getTime()}`,
      kind: "auto-request",
      title: `${list.name} requested ${count} ${count === 1 ? "title" : "titles"}`,
      body: list.autoRequestedTitles ? `Asked Overseerr for ${list.autoRequestedTitles}` : "Asked Overseerr on the list's behalf",
      href: `/lists/${list.id}`,
      at: list.autoRequestedAt!.toISOString(),
      icon: "clock",
    });
  }

  for (const a of arrivals) {
    const key = `${a.mediaType}-${a.tmdbId}`;
    if (a.requestedById !== userId && !savedTitles.has(key)) continue;
    const name = savedTitles.get(key) ?? a.title;
    if (!name) continue;
    push({
      key: `arrived:${key}:${a.availableAt!.getTime()}`,
      kind: "arrived",
      title: `${name} is on Plex`,
      body: a.requestedById === userId ? "What you asked for has arrived" : "From your watchlist, ready to watch",
      href: titleHref(a.mediaType === "tv" ? "tv" : "movie", a.tmdbId),
      at: a.availableAt!.toISOString(),
      icon: "play",
    });
  }

  items.sort((a, b) => b.at.localeCompare(a.at));
  // `everything` is for clearing: past the first thirty there may be more,
  // and a clear that let the next ones surface would not look like a clear.
  const kept = everything ? items : items.slice(0, LIMIT);

  const newest = unlocked.find((row) => ACHIEVEMENTS_BY_ID.has(row.key));
  const achievement = newest ? ACHIEVEMENTS_BY_ID.get(newest.key)! : null;

  return {
    items: kept,
    unread: kept.filter((i) => !i.read).length,
    newestBadge:
      newest && achievement
        ? {
            key: `${newest.key}:${newest.unlockedAt.getTime()}`,
            name: achievement.name,
            icon: achievement.icon,
            description: achievement.description,
            tier: achievement.tier,
            xp: newest.carried ? 0 : BADGE_XP[achievement.tier],
            at: newest.unlockedAt.toISOString(),
          }
        : null,
  };
}

/** Who is signed in, as the chrome draws them: name, picture, level. */
export async function meFor(userId: string): Promise<Me | null> {
  const [user, level] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatarSetAt: true,
        screensaverIdle: true,
        plexManaged: true,
        plexHomeLinkedAt: true,
        background: true,
        backgroundHue: true,
      },
    }),
    getLevel(userId),
  ]);
  if (!user) return null;
  const background = backgroundFromRow(user.background, user.backgroundHue);
  const poster = background.variant === "artwork" ? await dailyPoster(userId, todayKey()) : null;
  return {
    id: user.id,
    name: user.name,
    avatar: avatarUrl(user),
    level: level.level,
    rank: level.rank,
    xp: level.xp,
    toNextLevel: level.toNextLevel,
    percent: level.percent,
    maxed: level.maxed,
    screensaverIdle: user.screensaverIdle,
    plexHome: user.plexManaged || user.plexHomeLinkedAt !== null,
    background: { ...background, poster },
  };
}

const BELL_LIFETIME_S = 60;

/** The bell's answer, cached a minute per person; the read actions expire it. */
export function cachedBell(userId: string): Promise<BellData> {
  return unstable_cache(
    async () => {
      const [notes, me, news] = await Promise.all([deriveNotifications(userId), meFor(userId), newsFor(userId)]);
      return { ...notes, me, newsUnread: news.filter((n) => !n.read).length };
    },
    // The level's rules version is in the key: this cache lives on disk in
    // `.next/cache` and outlasts builds, so an answer worked out under older
    // arithmetic would otherwise be served once, stale, after an upgrade. The
    // shape's version is there for the same reason: `me.background` and
    // `newsUnread` are newer.
    ["bell", `level-${LEVEL_RULES}`, "shape-3", userId],
    { tags: [bellTag(userId)], revalidate: BELL_LIFETIME_S },
  )();
}

/** An upsert, so two tabs marking the same thing cannot fail each other. */
export async function markRead(userId: string, key: string) {
  if (!key || key.length > 200) return;
  await db.notificationRead
    .upsert({ where: { userId_key: { userId, key } }, create: { userId, key }, update: {} })
    .catch(() => undefined);
  if (key.startsWith("rec:")) {
    await db.recommendation
      .updateMany({ where: { id: key.slice(4), toUserId: userId, seenAt: null }, data: { seenAt: new Date() } })
      .catch(() => undefined);
  }
}

export async function markAllRead(userId: string, now = new Date()) {
  const { items } = await deriveNotifications(userId, now);
  for (const item of items.filter((i) => !i.read)) await markRead(userId, item.key);
}

/**
 * Clears the list: the notifications go away rather than staying on it read.
 * Everything the bell would show, as the old app cleared it, a pending friend
 * request included; the things behind them are untouched, so that request
 * still waits on the friends page, a badge is still on Badges, and a
 * recommendation is still on its title. `readAt` moves to now, because the
 * daily cap keeps the newest read marks, and a clear it pruned would come back.
 */
export async function dismissAll(userId: string, now = new Date()) {
  const { items } = await deriveNotifications(userId, now, { everything: true });
  for (const item of items) {
    await db.notificationRead
      .upsert({
        where: { userId_key: { userId, key: item.key } },
        create: { userId, key: item.key, dismissed: true, readAt: now },
        update: { dismissed: true, readAt: now },
      })
      .catch(() => undefined);
  }
}
