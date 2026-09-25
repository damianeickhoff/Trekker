import { describe, expect, it } from "vitest";
import { challengesFor, periodKey } from "@/lib/challenges/catalogue";
import { todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { deriveNotifications, dismissAll, markAllRead, markRead, type NoteKind } from "@/lib/notifications";
import { personNewsDraft } from "@/lib/news";
import { freshUser } from "./helpers/db";

/**
 * The bell is derived, not stored: each kind comes from the rows that are its
 * reason to exist, and only the read marks are written. One test per kind,
 * then the read marks.
 */

const now = new Date();
const kinds = async (userId: string) => (await deriveNotifications(userId, now)).items.map((i) => i.kind);
const only = async (userId: string, kind: NoteKind) =>
  (await deriveNotifications(userId, now)).items.filter((i) => i.kind === kind);

describe("each kind of notification", () => {
  it("the month's challenges are up, from the calendar alone", async () => {
    const userId = (await freshUser()).id;
    const [note] = await only(userId, "challenges-up");
    expect(note.key).toBe(`challenges:${periodKey(now)}`);
    const worth = challengesFor(now).reduce((sum, c) => sum + c.xp, 0);
    expect(note.body).toBe(`Three new things, worth ${worth.toLocaleString("en-GB")} XP`);
    expect(note.read).toBe(false);
  });

  it("airing today: one line for everything unwatched on today", async () => {
    const userId = (await freshUser()).id;
    const today = todayKey(now);
    await db.titleState.create({ data: { userId, showId: 77, showName: "Minerva Academy", watchedCount: 2 } });
    await db.showEpisode.createMany({
      data: [
        { showId: 77, seasonNumber: 1, episodeNumber: 3, name: "Three", airDate: today },
        { showId: 77, seasonNumber: 1, episodeNumber: 4, name: "Four", airDate: today },
        { showId: 77, seasonNumber: 1, episodeNumber: 5, name: "Five", airDate: "2099-01-01" },
      ],
    });
    const [note] = await only(userId, "airing");
    expect(note).toMatchObject({ key: `airing:${today}`, title: "Airing today", href: "/calendar" });
    expect(note.body).toBe("Minerva Academy S01 · E03 and 1 more");
  });

  it("a friend request, until it is answered", async () => {
    const me = await freshUser();
    const eva = await freshUser();
    const request = await db.friendship.create({ data: { requesterId: eva.id, addresseeId: me.id } });
    const [note] = await only(me.id, "friend-request");
    expect(note).toMatchObject({ key: `friend:${request.id}`, title: `${eva.name} wants to be friends`, href: "/friends" });

    await db.friendship.update({ where: { id: request.id }, data: { status: "accepted" } });
    expect(await kinds(me.id)).not.toContain("friend-request");
  });

  it("a recommendation, with the sender's own words, read once seen", async () => {
    const me = await freshUser();
    const anna = await freshUser();
    const rec = await db.recommendation.create({
      data: { fromUserId: anna.id, toUserId: me.id, mediaType: "movie", tmdbId: 5, title: "Digger", note: "The shovel bit." },
    });
    const [note] = await only(me.id, "recommendation");
    expect(note).toMatchObject({ title: `${anna.name} recommends Digger`, body: "“The shovel bit.”", href: "/title/movie/5", read: false });
    await db.recommendation.update({ where: { id: rec.id }, data: { seenAt: new Date() } });
    expect((await only(me.id, "recommendation"))[0].read).toBe(true);
  });

  it("a badge earned, and it is the toast's newest", async () => {
    const userId = (await freshUser()).id;
    const at = new Date(now.getTime() - 60_000);
    await db.unlockedAchievement.create({ data: { userId, key: "night-owl", unlockedAt: at } });
    await db.unlockedAchievement.create({ data: { userId, key: "no-longer-in-the-catalogue", unlockedAt: now } });
    const result = await deriveNotifications(userId, now);
    const notes = result.items.filter((i) => i.kind === "badge");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ key: `badge:night-owl:${at.getTime()}`, title: "Badge earned: Night Owl" });
    expect(result.newestBadge).toMatchObject({ name: "Night Owl", tier: "bronze", xp: 150, at: at.toISOString() });
  });

  it("a challenge completed, with the XP it paid", async () => {
    const userId = (await freshUser()).id;
    await db.challengeRun.create({ data: { userId, key: "double-bill", period: "2026-08", xp: 400 } });
    const [note] = await only(userId, "challenge-won");
    expect(note).toMatchObject({ key: "challenge-won:double-bill:2026-08", title: "Challenge complete: Double Bill" });
    expect(note.body).toContain("+400 XP");
  });

  it("news from someone followed, but nothing from before the follow", async () => {
    const userId = (await freshUser()).id;
    await db.person.create({ data: { tmdbId: 3497, name: "Kyle Chandler" } });
    const followedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await db.followedPerson.create({ data: { userId, personId: 3497, followedAt } });
    const draft = (tmdbId: number, title: string) =>
      personNewsDraft({ id: 3497, name: "Kyle Chandler", profilePath: null }, { mediaType: "tv", tmdbId, title, kind: "announced" });
    await db.newsItem.create({ data: { ...draft(1, "Old news"), at: new Date(followedAt.getTime() - 1000) } });
    await db.newsItem.create({ data: { ...draft(2, "Lanterns"), at: now } });
    const notes = await only(userId, "news");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: "New from Kyle Chandler", body: "Lanterns announced", href: "/title/tv/2" });
  });
});

describe("read marks", () => {
  it("marks one read, then the rest, and counts what is left", async () => {
    const me = await freshUser();
    const eva = await freshUser();
    await db.friendship.create({ data: { requesterId: eva.id, addresseeId: me.id } });
    const first = await deriveNotifications(me.id, now);
    expect(first.unread).toBe(2); // the request and the month's challenges

    await markRead(me.id, first.items.find((i) => i.kind === "friend-request")!.key);
    const second = await deriveNotifications(me.id, now);
    expect(second.unread).toBe(1);
    // Read is not answered: the request stays on the list, greyed.
    expect(second.items.find((i) => i.kind === "friend-request")!.read).toBe(true);

    await markAllRead(me.id, now);
    expect((await deriveNotifications(me.id, now)).unread).toBe(0);
    // Marking twice is not an error.
    await markAllRead(me.id, now);
    expect(await db.notificationRead.count({ where: { userId: me.id } })).toBe(2);
  });

  it("marks a recommendation seen when it is read", async () => {
    const me = await freshUser();
    const anna = await freshUser();
    const rec = await db.recommendation.create({ data: { fromUserId: anna.id, toUserId: me.id, mediaType: "tv", tmdbId: 9, title: "Lanterns" } });
    await markRead(me.id, `rec:${rec.id}`);
    expect((await db.recommendation.findUniqueOrThrow({ where: { id: rec.id } })).seenAt).not.toBeNull();
  });
});

describe("clearing", () => {
  it("empties the list, a pending request too, and leaves what is behind it alone", async () => {
    const me = await freshUser();
    const eva = await freshUser();
    const request = await db.friendship.create({ data: { requesterId: eva.id, addresseeId: me.id } });
    const unlockedAt = new Date(now.getTime() - 60_000);
    await db.unlockedAchievement.create({ data: { userId: me.id, key: "night-owl", unlockedAt } });
    const before = await deriveNotifications(me.id, now);
    await markRead(me.id, before.items.find((i) => i.kind === "badge")!.key);

    await dismissAll(me.id, now);
    const after = await deriveNotifications(me.id, now);
    expect(after.items).toEqual([]);
    expect(after.unread).toBe(0);
    // One mark per notification, the one already read turned into a clear.
    const marks = await db.notificationRead.findMany({ where: { userId: me.id } });
    expect(marks).toHaveLength(before.items.length);
    expect(marks.every((m) => m.dismissed && m.readAt.getTime() === now.getTime())).toBe(true);
    // The request still waits to be answered, and the badge is still earned.
    expect((await db.friendship.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("pending");
    expect(await db.unlockedAchievement.count({ where: { userId: me.id } })).toBe(1);

    // Something new after the clear is news again.
    await db.friendship.create({ data: { requesterId: (await freshUser()).id, addresseeId: me.id } });
    expect((await deriveNotifications(me.id, now)).items.map((i) => i.kind)).toEqual(["friend-request"]);
  });

  it("clears past the first thirty, so nothing older surfaces behind them", async () => {
    const me = await freshUser();
    const others = await Promise.all(Array.from({ length: 35 }, () => freshUser()));
    await db.friendship.createMany({
      data: others.map((o, i) => ({ requesterId: o.id, addresseeId: me.id, createdAt: new Date(now.getTime() - i * 60_000) })),
    });
    expect((await deriveNotifications(me.id, now)).items).toHaveLength(30);
    await dismissAll(me.id, now);
    expect((await deriveNotifications(me.id, now)).items).toEqual([]);
  });
});
