import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { PEOPLE_FRESH_MS, PRESS_FRESH_MS, forgetNewsReads, queue, refreshNewsOnDemand } from "@/lib/refresh";
import { freshUser } from "./helpers/db";

/*
 * Round 9 follow-ups: news refreshed when /news is opened. The gate (a second
 * call within five minutes reads nothing), the hour for followed people, and
 * that a failing feed never fails the refresh. Nothing reaches the network:
 * the feeds are test addresses and fetch is stubbed.
 */

const signedIn = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => signedIn.user }));
vi.mock("next/cache", () => ({ refresh: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

const { refreshNews } = await import("@/lib/news-actions");

const fixture = readFileSync(path.join(import.meta.dirname, "fixtures", "feed-cdata-enclosure.xml"), "utf8");
const T = 1_000_000_000_000;
let asked: string[] = [];

beforeEach(() => {
  forgetNewsReads();
  asked = [];
  process.env.NEWS_FEEDS = "https://a.test/feed,https://b.test/feed";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      asked.push(url);
      if (url === "https://a.test/feed") return new Response(fixture, { status: 200 });
      throw new Error("down");
    }),
  );
});

afterEach(async () => {
  await queue.idle();
  vi.unstubAllGlobals();
  process.env.NEWS_FEEDS = "";
});

describe("news on demand", () => {
  it("reads the feeds once, then not again within five minutes", async () => {
    const first = await refreshNewsOnDemand(T);
    expect(first).toMatchObject({ press: true, people: true });
    expect(asked).toEqual(["https://a.test/feed", "https://b.test/feed"]);
    // The published times are the fixture's; they are stored as long as they are within thirty days of now.
    expect(first.added).toBe(await db.newsItem.count({ where: { subject: "press" } }));

    expect(await refreshNewsOnDemand(T + 60_000)).toEqual({ press: false, people: false, added: 0 });
    expect(await refreshNewsOnDemand(T + PRESS_FRESH_MS - 1)).toMatchObject({ press: false });
    expect(asked).toHaveLength(2);

    // Five minutes on, the feeds again; the people wait for their hour.
    expect(await refreshNewsOnDemand(T + PRESS_FRESH_MS)).toMatchObject({ press: true, people: false });
    expect(asked).toHaveLength(4);
    expect(await refreshNewsOnDemand(T + PEOPLE_FRESH_MS)).toMatchObject({ press: true, people: true });
  });

  it("shares one refresh between callers at the same moment", async () => {
    const [a, b] = await Promise.all([refreshNewsOnDemand(T), refreshNewsOnDemand(T)]);
    expect(a).toEqual(b);
    expect(asked).toHaveLength(2);
  });

  it("tolerates feeds that fail: the action answers, and the gate still holds", async () => {
    process.env.NEWS_FEEDS = "https://b.test/feed,https://c.test/feed";
    signedIn.user = { id: (await freshUser()).id };
    await expect(refreshNews()).resolves.toEqual({ checked: true, added: 0 });
    expect(asked).toEqual(["https://b.test/feed", "https://c.test/feed"]);
    await expect(refreshNews()).resolves.toEqual({ checked: false, added: 0 });
    expect(asked).toHaveLength(2);
  });

  it("does nothing for someone signed out", async () => {
    signedIn.user = null;
    await expect(refreshNews()).resolves.toEqual({ checked: false, added: 0 });
    expect(asked).toEqual([]);
  });
});
