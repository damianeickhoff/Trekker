import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { newsFor } from "@/lib/news";
import {
  DEFAULT_FEEDS,
  PER_FEED,
  feedsFrom,
  knownTitles,
  parseFeed,
  plainText,
  pressDrafts,
  pressNews,
  prunePress,
  recordPress,
  runPressPass,
  sourceName,
  titleMatcher,
  type FeedItem,
  type KnownTitle,
} from "@/lib/press";
import { cacheKey } from "@/lib/tmdb";
import { shortAgo } from "@/lib/when";
import { freshUser } from "./helpers/db";

/*
 * Round 9, popular news: the feed reader on three recorded shapes (invented
 * stories in the real feeds' markup), the headline matcher, the cap, storing
 * once, pruning, and that none of it leaks into anyone's For you. Nothing
 * reaches the network: the pass is handed feeds and fetch is stubbed.
 */

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
const NOW = new Date("2026-09-24T18:00:00Z");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading a feed", () => {
  it("reads a WordPress feed with media:content: entities decoded, http pictures refused, linkless items dropped", () => {
    const feed = parseFeed(fixture("feed-wordpress-media.xml"));
    expect(feed.title).toBe("Variety");
    expect(feed.items).toEqual([
      {
        headline: "Netflix’s ‘Severance’ Renewed for Season 3 & More",
        link: "https://example.com/2026/tv/news/severance-season-3-1234/",
        published: new Date("2026-09-24T16:05:00Z"),
        image: "https://example.com/wp-content/uploads/2026/09/sev.jpg",
        // Round 10: the summary line is kept, the "[…]" the site appends is not.
        summary: "The whole story would be here, which is never kept.",
      },
      {
        headline: "Box Office: A Quiet Weekend",
        link: "https://example.com/2026/film/box-office-quiet-5678/",
        published: new Date("2026-09-23T09:30:00Z"),
        image: "https://example.com/wp-content/uploads/2026/09/box.jpg",
        summary: null,
      },
    ]);
  });

  it("reads CDATA titles, image enclosures, and a picture from the summary's markup", () => {
    const feed = parseFeed(fixture("feed-cdata-enclosure.xml"));
    expect(sourceName(feed.title, "https://example.org/feed/")).toBe("Screen Rant");
    expect(feed.items.map((i) => [i.headline, i.image])).toEqual([
      ["The Last of Us Season 3 Casts Two Newcomers", "https://static.example.org/wp-content/uploads/2026/09/tlou.jpg"],
      ["Ten Thrillers Worth Your Weekend", "https://static.example.org/thrillers.jpg"],
    ]);
    expect(feed.items[0].published).toEqual(new Date("2026-09-24T14:00:00Z"));
  });

  it("reads Atom: the alternate link, published before updated, escaped markup, and no javascript: links", () => {
    const feed = parseFeed(fixture("feed-atom.xml"));
    expect(sourceName(feed.title, "https://example.net/feed.atom")).toBe("Example Weekly");
    expect(feed.items).toEqual([
      {
        headline: "Dune: Part Three dated for December <3",
        link: "https://example.net/dune-part-three-dated?utm=a&b=c",
        published: new Date("2026-09-24T11:00:00Z"),
        image: "https://example.net/img/dune.webp",
        summary: "Never kept.",
      },
      { headline: "Only updated", link: "https://example.net/only-updated", published: new Date("2026-09-20T08:00:00Z"), image: null, summary: null },
    ]);
  });

  it("never keeps the article: the body never reaches an item, only the summary line (Round 10)", () => {
    for (const name of ["feed-wordpress-media.xml", "feed-cdata-enclosure.xml", "feed-atom.xml"]) {
      const text = JSON.stringify(parseFeed(fixture(name)).items);
      expect(text).not.toMatch(/article body/i);
    }
    expect(parseFeed(fixture("feed-cdata-enclosure.xml")).items[0].summary).toBe("A summary that is never stored.");
  });

  it("strips tags and decodes entities in a headline", () => {
    expect(plainText("<![CDATA[<b>Bold</b> &amp; &#x201C;quoted&#x201D;]]>")).toBe("Bold & “quoted”");
    expect(plainText("  Two\n  lines  ")).toBe("Two lines");
  });

  it("names a feed nobody named by its title's last part, or its host", () => {
    expect(sourceName("TV News | Deadline", "https://deadline.com/feed/")).toBe("Deadline");
    expect(sourceName(null, "https://www.example.com/rss")).toBe("example.com");
  });
});

describe("which feeds", () => {
  it("uses the built-in list unless NEWS_FEEDS says otherwise, and empty turns it off", () => {
    expect(feedsFrom(undefined)).toBe(DEFAULT_FEEDS);
    expect(feedsFrom("")).toEqual([]);
    expect(feedsFrom(" https://a.example/feed , ftp://b.example/x, nonsense ,https://c.example/rss")).toEqual([
      { url: "https://a.example/feed", name: null },
      { url: "https://c.example/rss", name: null },
    ]);
    for (const f of DEFAULT_FEEDS) expect(f.url).toMatch(/^https:\/\//);
  });
});

describe("matching a headline to a title", () => {
  const titles: KnownTitle[] = [
    { mediaType: "tv", tmdbId: 100088, title: "The Last of Us", poster: "/tlou.jpg" },
    { mediaType: "tv", tmdbId: 1, title: "Last", poster: null },
    { mediaType: "tv", tmdbId: 95396, title: "Severance", poster: "/sev.jpg" },
    { mediaType: "movie", tmdbId: 2, title: "Up", poster: null },
    { mediaType: "tv", tmdbId: 1416, title: "Grey's Anatomy", poster: null },
    { mediaType: "movie", tmdbId: 3, title: "Heat", poster: null },
  ];
  const match = titleMatcher(titles);

  it("finds the longest whole-words name, whatever the case", () => {
    expect(match("THE LAST OF US season 3 casts two")?.tmdbId).toBe(100088);
    expect(match("Netflix’s ‘Severance’ renewed")?.tmdbId).toBe(95396);
    expect(match("Grey’s Anatomy star exits")?.tmdbId).toBe(1416);
  });

  it("ignores short names and names inside other words", () => {
    expect(match("What's up with the box office")).toBeNull();
    expect(match("Severances are not a show")).toBeNull();
    expect(match("A heatwave hits the set")).toBeNull();
    expect(match("Heat, 30 years on")?.tmdbId).toBe(3);
  });

  it("knows the titles the cache holds details and trending lists for, without parsing a details body", async () => {
    const put = (key: string, body: unknown) =>
      db.tmdbCache.create({ data: { key, body: JSON.stringify(body), expiresAt: new Date(Date.now() + 3_600_000) } });
    await put(cacheKey("/tv/95396", { append_to_response: "credits,videos" }), { id: 95396, name: "Severance", poster_path: "/sev.jpg" });
    await put("/tv/95396/season/1", { name: "Season 1" });
    await put("/movie/693134", { id: 693134, title: "Dune: Part Three", poster_path: null });
    await put("/trending/all/week", { results: [{ id: 5, media_type: "tv", name: "Andor", poster_path: "/a.jpg" }, { id: 6, media_type: "person", name: "Someone" }] });
    await put("/movie/popular", { results: [{ id: 7, title: "Weapons", poster_path: "/w.jpg" }] });
    await put("/search/multi?query=x", { results: [{ id: 8, media_type: "tv", name: "Not Matched" }] });
    const known = await knownTitles();
    expect(known.map((k) => `${k.mediaType}-${k.tmdbId}:${k.title}`).sort()).toEqual(
      ["movie-693134:Dune: Part Three", "movie-7:Weapons", "tv-5:Andor", "tv-95396:Severance"].sort(),
    );
  });
});

describe("storing", () => {
  const item = (n: number, hoursAgo: number | null, extra: Partial<FeedItem> = {}): FeedItem => ({
    headline: `Story ${n}`,
    link: `https://example.com/${n}`,
    published: hoursAgo === null ? null : new Date(NOW.getTime() - hoursAgo * 3_600_000),
    image: null,
    ...extra,
  });
  const none = () => null;

  it("keeps the newest forty a feed, none past thirty days, and no future dates", () => {
    const items = [...Array.from({ length: 50 }, (_, i) => item(i, i + 1)), item(98, 24 * 31), item(99, -5)];
    const drafts = pressDrafts(items, "Variety", none, NOW);
    expect(drafts).toHaveLength(PER_FEED);
    expect(drafts[0]).toMatchObject({ headline: "Story 99", at: NOW });
    expect(drafts.map((d) => d.headline)).not.toContain("Story 98");
    expect(drafts.at(-1)?.headline).toBe("Story 38");
  });

  it("writes an article once whichever feed carries it, with its title where the headline names one", async () => {
    const match = titleMatcher([{ mediaType: "tv", tmdbId: 95396, title: "Severance", poster: "/sev.jpg" }]);
    const drafts = pressDrafts([item(1, 2, { headline: "Severance returns" }), item(2, 3, { image: "https://example.com/2.jpg" })], "Variety", match, NOW);
    expect(await recordPress(drafts)).toBe(2);
    expect(await recordPress(pressDrafts([item(1, 2, { headline: "Severance returns" })], "Deadline", match, NOW))).toBe(0);
    const rows = await pressNews();
    expect(rows).toEqual([
      {
        id: expect.any(String),
        headline: "Severance returns",
        link: "https://example.com/1",
        source: "Variety",
        at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
        imageUrl: null,
        match: { mediaType: "tv", tmdbId: 95396, title: "Severance", poster: "/sev.jpg" },
        tag: null,
        summary: null,
        feedUrl: null,
      },
      expect.objectContaining({ headline: "Story 2", imageUrl: "https://example.com/2.jpg", match: null }),
    ]);
  });

  it("prunes press rows past thirty days and leaves everything else", async () => {
    await recordPress(pressDrafts([item(1, 2), item(2, 24 * 29)], "Variety", none, NOW));
    await db.newsItem.create({
      data: { subject: "tv", subjectId: 1, kind: "ended", mediaType: "tv", tmdbId: 1, title: "Old", headline: "Old has ended", detail: "", key: "tv:1:status:ended", at: new Date("2020-01-01") },
    });
    const later = new Date(NOW.getTime() + 2 * 24 * 3_600_000);
    expect(await prunePress(later)).toBe(1);
    expect((await pressNews()).map((r) => r.headline)).toEqual(["Story 1"]);
    expect(await db.newsItem.count({ where: { subject: "tv" } })).toBe(1);
  });

  it("stays out of For you: no row, no count", async () => {
    const user = await freshUser();
    await db.followedPerson.create({ data: { userId: user.id, personId: 3497 } });
    await recordPress(pressDrafts([item(1, 0)], "Variety", none, new Date()));
    expect(await newsFor(user.id)).toEqual([]);
  });

  it("says a headline's age short", () => {
    expect(shortAgo(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe("now");
    expect(shortAgo(new Date(NOW.getTime() - 12 * 60_000).toISOString(), NOW)).toBe("12 min");
    expect(shortAgo(new Date(NOW.getTime() - 3.5 * 3_600_000).toISOString(), NOW)).toBe("3 h");
    expect(shortAgo(new Date(NOW.getTime() - 50 * 3_600_000).toISOString(), NOW)).toBe("2 d");
  });
});

describe("the pass", () => {
  it("reads each feed once, fails soft per feed, and reaches nothing else", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        asked.push(url);
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        if (url === "https://a.test/feed") return new Response(fixture("feed-cdata-enclosure.xml"), { status: 200 });
        if (url === "https://b.test/feed") throw new Error("down");
        if (url === "https://c.test/feed") return new Response("nope", { status: 500 });
        return new Response(fixture("feed-atom.xml"), { status: 200 });
      }),
    );
    const feeds = ["https://a.test/feed", "https://b.test/feed", "https://c.test/feed", "https://d.test/feed"].map((url) => ({ url, name: null }));
    const result = await runPressPass(NOW, feeds);
    // Each feed once, then (Round 10 review) the head of the one article whose item had no picture.
    expect(asked).toEqual([...feeds.map((f) => f.url), "https://example.net/only-updated"]);
    expect(result).toEqual({ feeds: 4, read: 2, added: 4 });
    expect(new Set((await pressNews()).map((r) => r.source))).toEqual(new Set(["Screen Rant", "Example Weekly"]));
  });

  it("does nothing with no feeds", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await runPressPass(NOW, [])).toEqual({ feeds: 0, read: 0, added: 0 });
    expect(await runPressPass(NOW)).toEqual({ feeds: 0, read: 0, added: 0 });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("the migration", () => {
  it("keeps every NewsItem with its id, and makes room for press rows", async () => {
    const { default: Database } = await import("better-sqlite3");
    const before = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20260924235000_news/migration.sql"), "utf8");
    const sql = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20260925090000_press_news/migration.sql"), "utf8");
    const mem = new Database(":memory:");
    mem.exec(`
      CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "Person" ("tmdbId" INTEGER NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "profilePath" TEXT);
      CREATE TABLE "PersonNews" ("id" TEXT NOT NULL PRIMARY KEY, "personId" INTEGER NOT NULL, "mediaType" TEXT NOT NULL, "tmdbId" INTEGER NOT NULL, "title" TEXT NOT NULL, "kind" TEXT NOT NULL, "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX "PersonNews_personId_mediaType_tmdbId_kind_key" ON "PersonNews"("personId", "mediaType", "tmdbId", "kind");
      CREATE INDEX "PersonNews_personId_at_idx" ON "PersonNews"("personId", "at");
    `);
    mem.exec(before);
    mem.exec(`INSERT INTO "NewsItem" ("id", "subject", "subjectId", "kind", "mediaType", "tmdbId", "title", "image", "headline", "detail", "key")
      VALUES ('n1', 'tv', 95396, 'ended', 'tv', 95396, 'Severance', '/sev.jpg', 'Severance has ended', 'Its last season has aired', 'tv:95396:status:ended')`);
    mem.exec(sql);
    expect(mem.prepare(`SELECT "id", "title", "source", "link", "imageUrl" FROM "NewsItem"`).all()).toEqual([
      { id: "n1", title: "Severance", source: null, link: null, imageUrl: null },
    ]);
    mem.exec(`INSERT INTO "NewsItem" ("id", "subject", "subjectId", "kind", "headline", "detail", "key", "source", "link")
      VALUES ('p1', 'press', 0, 'press', 'A headline', '', 'press:https://a/1', 'Variety', 'https://a/1')`);
    expect(() =>
      mem.exec(`INSERT INTO "NewsItem" ("id", "subject", "subjectId", "kind", "headline", "detail", "key", "link") VALUES ('p2', 'press', 0, 'press', 'Again', '', 'press:other', 'https://a/1')`),
    ).toThrow(/UNIQUE/);
  });
});
