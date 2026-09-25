import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { freshUser } from "./helpers/db";

/**
 * The morning push, against a web-push stand-in: nothing here reaches a push
 * service. Retired subscriptions (404, 410) go; everyone is told once a day.
 */

const sent = vi.hoisted(() => ({ calls: [] as { endpoint: string; payload: string }[], fail: new Map<string, number>() }));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      const status = sent.fail.get(sub.endpoint);
      if (status) throw Object.assign(new Error("push refused"), { statusCode: status });
      sent.calls.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    },
  },
}));

const { runDailyPush } = await import("@/lib/push-job");
const { sendToUser } = await import("@/lib/push");

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  sent.calls = [];
  sent.fail.clear();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

async function device(userId: string, endpoint: string) {
  return db.pushSubscription.create({ data: { userId, endpoint, p256dh: "k", auth: "a" } });
}

describe("the morning push", () => {
  it("tells each device what airs today in the bell's words, once a day, and retires a gone subscription", async () => {
    const userId = (await freshUser()).id;
    const today = todayKey();
    await db.titleState.create({ data: { userId, showId: 77, showName: "Minerva Academy", watchedCount: 1 } });
    await db.showEpisode.create({ data: { showId: 77, seasonNumber: 1, episodeNumber: 3, name: "Three", airDate: today } });
    await device(userId, "https://push.example/phone");
    await device(userId, "https://push.example/old-laptop");
    sent.fail.set("https://push.example/old-laptop", 410);

    const first = await runDailyPush();
    expect(first.results).toEqual([{ userId, messages: 1, sent: 1, retired: 1 }]);
    expect(JSON.parse(sent.calls[0].payload)).toMatchObject({
      title: "Airing today",
      body: "Minerva Academy S01 · E03",
      url: "/calendar",
    });
    expect(await db.pushSubscription.count({ where: { userId } })).toBe(1);
    expect((await db.pushSubscription.findFirstOrThrow({ where: { userId } })).lastSent).toBe(today);

    // Run again the same day: nobody is due.
    const second = await runDailyPush();
    expect(second.people).toBe(0);
    expect(sent.calls).toHaveLength(1);
  });

  it("keeps a device a push service refused for another reason", async () => {
    const userId = (await freshUser()).id;
    await db.titleState.create({ data: { userId, showId: 78, showName: "Lanterns", watchedCount: 1 } });
    await db.showEpisode.create({ data: { showId: 78, seasonNumber: 1, episodeNumber: 1, name: "One", airDate: todayKey() } });
    await device(userId, "https://push.example/flaky");
    sent.fail.set("https://push.example/flaky", 500);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runDailyPush();
    errors.mockRestore();
    expect(await db.pushSubscription.count({ where: { userId } })).toBe(1);
  });

  it("sends nothing to someone with nothing on, but still marks them told", async () => {
    const userId = (await freshUser()).id;
    await device(userId, "https://push.example/quiet");
    const result = await runDailyPush();
    expect(result.results).toEqual([{ userId, messages: 0, sent: 0, retired: 0 }]);
    expect(sent.calls).toHaveLength(0);
  });

  it("says the month's challenges are up on the first, only to those who asked", async () => {
    const keen = (await freshUser()).id;
    const quiet = (await freshUser()).id;
    await db.user.update({ where: { id: keen }, data: { notifyChallenges: true } });
    await device(keen, "https://push.example/keen");
    await device(quiet, "https://push.example/quiet");

    // The second of the month: nobody hears about challenges.
    await runDailyPush(new Date(2026, 9, 2, 9));
    expect(sent.calls).toHaveLength(0);

    await db.pushSubscription.updateMany({ data: { lastSent: null } });
    const first = await runDailyPush(new Date(2026, 10, 1, 9));
    expect(first.results.find((r) => r.userId === keen)).toMatchObject({ messages: 1, sent: 1 });
    expect(first.results.find((r) => r.userId === quiet)).toMatchObject({ messages: 0, sent: 0 });
    expect(sent.calls.map((c) => c.endpoint)).toEqual(["https://push.example/keen"]);
    expect(JSON.parse(sent.calls[0].payload)).toMatchObject({ title: "November’s challenges are up", url: "/" });
  });
});

describe("the switches in Settings", () => {
  it("holds back a friend request or recommendation from someone who turned them off", async () => {
    const userId = (await freshUser()).id;
    await device(userId, "https://push.example/phone");
    const message = { title: "Anna wants to be friends", body: "Accept from the friends page", url: "/friends" };

    expect(await sendToUser(userId, message, "friends")).toMatchObject({ sent: 1 });
    await db.user.update({ where: { id: userId }, data: { notifyFriends: false } });
    expect(await sendToUser(userId, message, "friends")).toMatchObject({ sent: 0 });
    // The morning push has no topic, and is the device's own switch.
    expect(await sendToUser(userId, message)).toMatchObject({ sent: 1 });
    expect(sent.calls).toHaveLength(2);
  });
});
