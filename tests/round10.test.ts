import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { newsLine, notificationsLine } from "@/components/settings/summaries";
import { db } from "@/lib/db";
import { newsPushes, type NewsRow } from "@/lib/news";
import {
  CHANNEL_CAP,
  channelLabel,
  channelsFrom,
  chipFrom,
  chooseLead,
  entriesFor,
  isAbout,
  openingChip,
  pressFor,
  subjectFrom,
  trailersFrom,
} from "@/lib/news-page";
import {
  NOT_A_FEED,
  OWN_FEED_CAP,
  addOwnFeed,
  newsPrefs,
  ownFeeds,
  removeOwnFeed,
  setReadingPref,
  setSourceEnabled,
  sourcesFor,
  visibleFeeds,
} from "@/lib/news-settings";
import { SUMMARY_MAX, classifyHeadline, parseFeed, pressNews, prunePress, recordPress, runPressPass, summaryLine, type PressRow } from "@/lib/press";
import { freshUser } from "./helpers/db";

/*
 * Round 10: the News page as a news app, Settings › News and the Home rail.
 * The keyword rule, the summary line, the lead, the chips, Your channels, the
 * trailers, per-person sources and own feeds, the reading settings, the
 * split push, the summary line in Settings, the Home order and the migration.
 * Nothing reaches the network: feeds are fixtures handed to the code, and
 * `tests/setup.ts` sets NEWS_FEEDS empty unless a test says otherwise.
 */

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");
const NOW = new Date("2026-09-24T18:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

afterEach(() => {
  process.env.NEWS_FEEDS = "";
});

let seq = 0;
function yours(over: Partial<NewsRow> = {}): NewsRow {
  seq += 1;
  return {
    id: `n${seq}`,
    key: `news:n${seq}`,
    subject: "tv",
    subjectId: 100,
    kind: "renewed",
    mediaType: "tv",
    tmdbId: 100,
    title: "Lanterns",
    image: "/lanterns.jpg",
    headline: "Lanterns renewed",
    detail: "Back from the end",
    at: hoursAgo(2),
    read: false,
    video: null,
    ...over,
  };
}

function press(over: Partial<PressRow> = {}): PressRow {
  seq += 1;
  return {
    id: `p${seq}`,
    headline: "A headline",
    link: `https://example.com/${seq}`,
    source: "Variety",
    at: hoursAgo(1),
    imageUrl: null,
    match: null,
    tag: null,
    summary: null,
    feedUrl: null,
    ...over,
  };
}

describe("classifying a headline", () => {
  const cases: [string, ReturnType<typeof classifyHeadline>][] = [
    ["HBO renews Lanterns for a second season ahead of Sunday’s finale", "renewed"],
    ["Severance Season 3 Ordered at Apple", "renewed"],
    ["Netflix orders a third season of Wednesday", "renewed"],
    ["Idiots will not return for a third series, Channel 4 confirms", "cancelled"],
    ["Peacock axes Twisted Metal after two seasons", "cancelled"],
    ["The Rookie won’t return for season 9", "cancelled"],
    ["Show Not Renewed for Season 5 at ABC", "cancelled"],
    ["Netflix drops the first full trailer for Minerva Academy", "trailer"],
    ["First look: Dune Part Three’s Arrakis", "trailer"],
    ["Teaser: Andor returns", "trailer"],
    ["Jon Bernthal joins Monster: The Lizzie Borden Story", "casting"],
    ["The Last of Us Season 3 Casts Two Newcomers", "casting"],
    ["Zendaya to star in a new A24 thriller", "casting"],
    ["Digger opens to $48M, the biggest September debut in years", "box-office"],
    ["Box Office: A Quiet Weekend", "box-office"],
    ["Weapons crosses $200 million worldwide", "box-office"],
    ["Brothers review round-up: “a slow burn that pays off”", "reviews"],
    ["Critics are split on the new Superman", "reviews"],
    ["Resident Evil series moves to March 2027 as post-production runs long", "moved"],
    ["Blade delayed again", "moved"],
    ["Super Troopers 3 finally has a release date", "dated"],
    ["Dune: Part Three dated for December", "dated"],
    ["Warner sets Batman sequel for a 2027 release", "dated"],
  ];
  for (const [headline, tag] of cases) {
    it(`"${headline}" is ${tag}`, () => expect(classifyHeadline(headline)).toBe(tag));
  }

  it("leaves headlines about none of them alone, and does not match inside words", () => {
    for (const headline of [
      "Ten thrillers worth your weekend",
      "The podcast everyone is talking about",
      "Emmys 2026: the full list of winners",
      "Updated: what is streaming this week",
      "The broadcast rights war heats up",
    ]) {
      expect(classifyHeadline(headline)).toBeNull();
    }
  });
});

describe("the summary line", () => {
  it("keeps two sentences as plain text, never the body, and drops the site's boilerplate", () => {
    const feed = parseFeed(fixture("feed-summaries.xml"));
    expect(feed.items.map((i) => i.summary)).toEqual([
      "Two and a half minutes, one very angry headmistress, and a premiere date of 30 October. The series stars an ensemble of newcomers.",
      "Glen Powell’s treasure-hunt thriller beat tracking by $12M on strong word of mouth.",
      // Only the headline again: no line at all.
      null,
    ]);
    expect(JSON.stringify(feed.items)).not.toMatch(/article body/);
  });

  it("stops at 220 characters, at a word, with an ellipsis", () => {
    const long = `${"A very long sentence that keeps going ".repeat(10)}and ends here.`;
    const line = summaryLine(long)!;
    expect(line.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(line.endsWith("…")).toBe(true);
    expect(line).not.toMatch(/\s…$/);
  });

  it("strips tags and entities, and is null when empty", () => {
    expect(summaryLine("<p>One &amp; two.</p><p>Three!</p> Four.")).toBe("One & two. Three!");
    expect(summaryLine("<p> </p>")).toBeNull();
    expect(summaryLine("Read more")).toBeNull();
  });
});

describe("the lead story", () => {
  it("is the newest with a picture and a title, else the newest with a picture, else nothing", () => {
    const plain = press({ at: hoursAgo(1) });
    const pictured = press({ at: hoursAgo(2), imageUrl: "https://example.com/a.jpg" });
    const matched = press({ at: hoursAgo(3), imageUrl: "https://example.com/b.jpg", match: { mediaType: "tv", tmdbId: 1, title: "Lanterns", poster: null } });
    expect(chooseLead([plain, pictured, matched])?.id).toBe(matched.id);
    expect(chooseLead([plain, pictured])?.id).toBe(pictured.id);
    expect(chooseLead([plain])).toBeNull();
  });
});

describe("chips", () => {
  const renewal = yours({ kind: "new-season", headline: "Lanterns renewed for season 2", at: hoursAgo(3) });
  const trailer = yours({ kind: "trailer", at: hoursAgo(4), video: "abcdefghijk" });
  const cast = yours({ subject: "person", subjectId: 3497, kind: "announced", headline: "New from Jon Bernthal", detail: "Snow Ponies announced", at: hoursAgo(5) });
  const dated = yours({ subject: "movie", subjectId: 7, mediaType: "movie", tmdbId: 7, kind: "release-date", detail: "It was 1 Dec", at: hoursAgo(6) });
  const all = [renewal, trailer, cast, dated];
  const pTrailer = press({ tag: "trailer", at: hoursAgo(1) });
  const pRenewed = press({ tag: "renewed", at: hoursAgo(2) });
  const pNone = press({ tag: null, at: hoursAgo(3.5) });
  const pBox = press({ tag: "box-office", at: hoursAgo(7) });
  const headlines = [pTrailer, pRenewed, pNone, pBox];
  const ids = (chip: Parameters<typeof entriesFor>[0]) => entriesFor(chip, all, headlines).map((e) => e.row.id);

  it("reads the address, and Round 9's tabs still land", () => {
    expect(chipFrom("popular")).toBe("top");
    expect(chipFrom("for-you")).toBe("for-you");
    expect(chipFrom("box-office")).toBe("box-office");
    expect(chipFrom("nonsense")).toBeNull();
  });

  it("For you is your news alone, Top every headline alone", () => {
    expect(ids("for-you")).toEqual(all.map((r) => r.id));
    expect(ids("top")).toEqual([pTrailer.id, pRenewed.id, pNone.id, pBox.id]);
  });

  it("the kind chips mix your news of their kind with headlines classified so, newest first", () => {
    expect(ids("renewals")).toEqual([pRenewed.id, renewal.id]);
    expect(ids("trailers")).toEqual([pTrailer.id, trailer.id]);
    expect(ids("casting")).toEqual([cast.id]);
    expect(ids("dates")).toEqual([dated.id]);
    expect(ids("box-office")).toEqual([pBox.id]);
    expect(ids("reviews")).toEqual([]);
    expect(pressFor("for-you", headlines)).toEqual([]);
  });

  it("a subject keeps its own news and the headlines naming it; people are never matched in headlines", () => {
    const named = press({ match: { mediaType: "tv", tmdbId: 100, title: "Lanterns", poster: null } });
    const tv = subjectFrom("tv:100")!;
    expect(isAbout({ type: "yours", row: renewal }, tv)).toBe(true);
    expect(isAbout({ type: "yours", row: cast }, tv)).toBe(false);
    expect(isAbout({ type: "press", row: named }, tv)).toBe(true);
    expect(isAbout({ type: "press", row: pTrailer }, tv)).toBe(false);
    expect(isAbout({ type: "yours", row: cast }, subjectFrom("person:3497")!)).toBe(true);
    expect(subjectFrom("tv:abc")).toBeNull();
    expect(subjectFrom("season:1")).toBeNull();
  });

  it("New trailers: your titles' first, then headlines, a fortnight at most, opening the trailer or the article", () => {
    const old = yours({ kind: "trailer", at: new Date(NOW.getTime() - 15 * 86_400_000).toISOString(), video: "zzzzzzzzzzz" });
    const art = new Map([["tv:100", { backdrop: "/bd.jpg", poster: "/p.jpg", year: "2026" }]]);
    const cards = trailersFrom([trailer, old, renewal], [pTrailer, pRenewed], art, NOW);
    expect(cards.map((c) => c.id)).toEqual([trailer.id, pTrailer.id]);
    expect(cards[0]).toMatchObject({ href: "https://www.youtube.com/watch?v=abcdefghijk", line: "Series · 2026", backdrop: "/bd.jpg" });
    expect(cards[1].href).toBe(pTrailer.link);
  });
});

describe("where the page opens", () => {
  it("takes the address first, then Open on, and Top when For you is empty", () => {
    expect(openingChip("reviews", "top", 3, 3)).toBe("reviews");
    expect(openingChip(null, "top", 3, 3)).toBe("top");
    expect(openingChip(null, "for-you", 3, 3)).toBe("for-you");
    expect(openingChip(null, "for-you", 0, 3)).toBe("top");
    // Last used: For you until the browser moves it.
    expect(openingChip(null, "last", 3, 3)).toBe("for-you");
  });
});

describe("Your channels", () => {
  it("one per subject with news in the last thirty days, newest first, with its unread count", () => {
    const rows = [
      yours({ subjectId: 1, title: "Lanterns", at: hoursAgo(1) }),
      yours({ subjectId: 1, title: "Lanterns", at: hoursAgo(5), read: true }),
      yours({ subjectId: 1, title: "Lanterns", at: hoursAgo(6) }),
      yours({ subject: "person", subjectId: 9, headline: "New from Jon Bernthal", at: hoursAgo(2), read: true }),
      yours({ subjectId: 2, title: "Old Show", at: new Date(NOW.getTime() - 31 * 86_400_000).toISOString() }),
    ];
    const channels = channelsFrom(rows, NOW);
    expect(channels.map((c) => [c.subject.kind, c.subject.id, c.unread])).toEqual([
      ["tv", 1, 2],
      ["person", 9, 0],
    ]);
    expect(channelLabel(channels[1])).toBe("Jon");
    expect(channelLabel({ subject: { kind: "tv", id: 1 }, name: "Monster: The Lizzie Borden Story" })).toBe("Monster");
  });

  it("twelve at most", () => {
    const rows = Array.from({ length: 20 }, (_, i) => yours({ subjectId: i + 1, at: hoursAgo(i + 1) }));
    const channels = channelsFrom(rows, NOW);
    expect(channels).toHaveLength(CHANNEL_CAP);
    expect(channels[0].subject.id).toBe(1);
  });
});

describe("sources and own feeds", () => {
  const A = "https://a.test/feed";
  const B = "https://b.test/feed";
  const draft = (n: number, feedUrl: string, source = "A") => ({
    headline: `Story ${n}`,
    link: `https://example.com/${feedUrl.length}/${n}`,
    source,
    imageUrl: null,
    at: new Date(NOW.getTime() - n * 3_600_000),
    match: null,
    feedUrl,
  });

  it("a source turned off hides its headlines from that person alone", async () => {
    process.env.NEWS_FEEDS = `${A},${B}`;
    const [me, you] = [await freshUser(), await freshUser()];
    await recordPress([draft(1, A), draft(2, B, "B")]);
    await setSourceEnabled(me.id, "a.test", false);
    const mine = await pressNews({ feeds: await visibleFeeds(me.id) });
    const yours = await pressNews({ feeds: await visibleFeeds(you.id) });
    expect(mine.map((r) => r.headline)).toEqual(["Story 2"]);
    expect(yours.map((r) => r.headline)).toEqual(["Story 1", "Story 2"]);
    expect((await sourcesFor(me.id)).map((s) => [s.name, s.enabled])).toEqual([
      ["a.test", false],
      ["b.test", true],
    ]);
    await expect(setSourceEnabled(me.id, "nobody.test", false)).rejects.toThrow();
  });

  it("an own feed is read once on adding, and its headlines are its owner's alone", async () => {
    const [me, you] = [await freshUser(), await freshUser()];
    const url = "https://own.test/rss";
    const outcome = await addOwnFeed(me.id, url, async () => fixture("feed-summaries.xml"));
    expect(outcome).toMatchObject({ ok: true, feed: { url, name: "Example Daily", enabled: true }, added: 3 });
    const mine = await pressNews({ feeds: await visibleFeeds(me.id) });
    expect(mine.map((r) => r.feedUrl)).toEqual([url, url, url]);
    expect(mine[0]).toMatchObject({ tag: "trailer", summary: expect.stringContaining("headmistress") });
    expect(await pressNews({ feeds: await visibleFeeds(you.id) })).toEqual([]);

    // Off, gone from the page; removed, the rows go too.
    const [feed] = await ownFeeds(me.id);
    await db.userFeed.update({ where: { id: feed.id }, data: { enabled: false } });
    expect(await pressNews({ feeds: await visibleFeeds(me.id) })).toEqual([]);
    await removeOwnFeed(you.id, feed.id);
    expect(await ownFeeds(me.id)).toHaveLength(1);
    await removeOwnFeed(me.id, feed.id);
    expect(await db.newsItem.count({ where: { feedUrl: url } })).toBe(0);
  });

  it("refuses what did not answer with a feed, the instance's own feeds, repeats, and past ten", async () => {
    process.env.NEWS_FEEDS = A;
    const me = await freshUser();
    expect(await addOwnFeed(me.id, "https://html.test/", async () => "<html><body>Hi</body></html>")).toEqual({ ok: false, error: NOT_A_FEED });
    expect(await addOwnFeed(me.id, "https://down.test/", async () => null)).toEqual({ ok: false, error: NOT_A_FEED });
    expect(await addOwnFeed(me.id, "javascript:alert(1)", async () => "")).toMatchObject({ ok: false });
    expect(await addOwnFeed(me.id, A, async () => fixture("feed-summaries.xml"))).toMatchObject({ ok: false });
    for (let i = 0; i < OWN_FEED_CAP; i += 1) {
      await db.userFeed.create({ data: { userId: me.id, url: `https://f${i}.test/rss`, name: `F${i}` } });
    }
    const asked: string[] = [];
    const eleventh = await addOwnFeed(me.id, "https://eleven.test/rss", async (u) => (asked.push(u), fixture("feed-summaries.xml")));
    expect(eleventh.ok).toBe(false);
    expect(!eleventh.ok && eleventh.error).toMatch(/10 feeds/);
    // At the cap it does not even ask.
    expect(asked).toEqual([]);
  });

  it("the pass reads own feeds with the instance's, once per address, and brings old rows up to date", async () => {
    process.env.NEWS_FEEDS = A;
    const [me, you] = [await freshUser(), await freshUser()];
    await db.userFeed.create({ data: { userId: me.id, url: "https://own.test/rss", name: "Own" } });
    await db.userFeed.create({ data: { userId: you.id, url: "https://own.test/rss", name: "Own" } });
    await db.userFeed.create({ data: { userId: you.id, url: "https://off.test/rss", name: "Off", enabled: false } });
    // A row from before Round 10: no tag, no feed.
    await db.newsItem.create({
      data: { subject: "press", subjectId: 0, kind: "press", headline: "Show renewed for season 2", detail: "", key: "press:https://old.test/1", source: "a.test", link: "https://old.test/1" },
    });
    const asked: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      asked.push(String(input));
      return new Response(fixture("feed-summaries.xml"), { status: 200 });
    }) as typeof fetch;
    try {
      // The first feed is named by its title, so name A's rows for the backfill through a named feed.
      await runPressPass(NOW, [{ url: A, name: "a.test" }, { url: "https://own.test/rss", name: "Own", own: true }]);
    } finally {
      globalThis.fetch = original;
    }
    // The feeds first, then the heads of the article whose item had no picture and of the old row.
    expect(asked.slice(0, 2)).toEqual([A, "https://own.test/rss"]);
    expect(asked.slice(2).sort()).toEqual(["https://example.org/ten-films/", "https://old.test/1"]);
    const old = await db.newsItem.findUniqueOrThrow({ where: { key: "press:https://old.test/1" } });
    expect([old.tag, old.feedUrl]).toEqual(["renewed", A]);
  });

  it("an own feed's rows go after the longest window its owners keep", async () => {
    const me = await freshUser();
    const url = "https://own.test/rss";
    await db.userFeed.create({ data: { userId: me.id, url, name: "Own" } });
    await setReadingPref(me.id, "keepDays", 7);
    await recordPress([draft(24 * 3, url), draft(24 * 10, url)]);
    expect(await prunePress(NOW)).toBe(1);
    expect((await pressNews()).map((r) => r.headline)).toEqual(["Story 72"]);
  });
});

describe("reading settings", () => {
  it("defaults to For you, marking read on opening and thirty days, and takes only what it offers", async () => {
    const me = await freshUser();
    expect(await newsPrefs(me.id)).toEqual({ openOn: "for-you", markOnOpen: true, keepDays: 30, pushBig: false, pushPeople: false });
    await setReadingPref(me.id, "openOn", "last");
    await setReadingPref(me.id, "markOnOpen", false);
    await setReadingPref(me.id, "keepDays", 7);
    expect(await newsPrefs(me.id)).toMatchObject({ openOn: "last", markOnOpen: false, keepDays: 7 });
    await expect(setReadingPref(me.id, "openOn", "popular")).rejects.toThrow();
    await expect(setReadingPref(me.id, "keepDays", 14)).rejects.toThrow();
    await expect(setReadingPref(me.id, "markOnOpen", "no")).rejects.toThrow();
  });

  it("marks read on opening only when asked to, on the page and on Home", () => {
    const cards = readFileSync(path.join(import.meta.dirname, "../src/components/news/your-cards.tsx"), "utf8");
    expect(cards).toMatch(/const key = markOnOpening\(row, markOnOpen\);\s+if \(key\) markOne\(key\);/);
    // Every card that opens a row goes through that one hook.
    expect(cards.match(/useOpen\(row, markOnOpen\)/g)).toHaveLength(4);
    expect(cards).not.toMatch(/onClick=\{\(\) => markOne/);
  });

  it("a shorter window hides older headlines from the page", async () => {
    await recordPress([
      { headline: "New", link: "https://example.com/new", source: "A", imageUrl: null, at: new Date(NOW.getTime() - 2 * 86_400_000), match: null },
      { headline: "Old", link: "https://example.com/old", source: "A", imageUrl: null, at: new Date(NOW.getTime() - 9 * 86_400_000), match: null },
    ]);
    const since = new Date(NOW.getTime() - 7 * 86_400_000);
    expect((await pressNews({ since })).map((r) => r.headline)).toEqual(["New"]);
  });
});

describe("push", () => {
  const big = yours({ kind: "cancelled", headline: "Lanterns cancelled", detail: "No more seasons are coming" });
  const moved = yours({ kind: "date-moved", headline: "Lanterns moves to 1 Nov", detail: "S02E01 was 20 Oct" });
  const trailer = yours({ kind: "trailer" });
  const person = yours({ subject: "person", kind: "announced", headline: "New from Jon Bernthal", detail: "Snow Ponies announced" });

  it("the big ones and people's new work are separate messages, each only when switched on", () => {
    const both = newsPushes([big, moved, trailer, person], { big: true, people: true }, "2026-09-24");
    expect(both.map((p) => [p.topic, p.title, p.body])).toEqual([
      ["news", "Lanterns cancelled", "No more seasons are coming and 1 more"],
      ["news-people", "New from Jon Bernthal", "Snow Ponies announced"],
    ]);
    expect(newsPushes([big, person], { big: false, people: true }, "2026-09-24").map((p) => p.topic)).toEqual(["news-people"]);
    expect(newsPushes([trailer], { big: true, people: true }, "2026-09-24")).toEqual([]);
    // One tag per day each, so a repeat collapses in the tray.
    expect(both.map((p) => p.tag)).toEqual(["news-2026-09-24", "news-people-2026-09-24"]);
  });
});

describe("Settings › News's line", () => {
  it("says how many sources and what is pushed", () => {
    expect(newsLine({ newsSources: 5, news: true, newsPeople: false })).toBe("5 sources · big ones pushed");
    expect(newsLine({ newsSources: 1, news: false, newsPeople: true })).toBe("1 source · new work pushed");
    expect(newsLine({ newsSources: 0, news: false, newsPeople: false })).toBe("No sources · nothing pushed");
    expect(newsLine({ newsSources: 7, news: true, newsPeople: true })).toBe("7 sources · big ones and new work pushed");
  });

  it("Notifications no longer speaks for news, which has its own section", () => {
    expect(notificationsLine({ push: null, friends: true, challenges: false })).toBe("Airing today, friends");
  });

  it("is a section between Notifications and Connections, with an address", async () => {
    const { SETTINGS_SECTIONS } = await import("@/components/settings/nav-items");
    expect(SETTINGS_SECTIONS.slice(3, 6)).toEqual(["notifications", "news", "connections"]);
    const page = readFileSync(path.join(import.meta.dirname, "../src/app/(app)/settings/[section]/page.tsx"), "utf8");
    expect(page).toMatch(/"news"/);
  });
});

describe("Home", () => {
  it("draws News after Trending and before Friends watched, at both widths", () => {
    const page = readFileSync(path.join(import.meta.dirname, "../src/app/(app)/(home)/page.tsx"), "utf8");
    const at = (name: string) => page.indexOf(`<${name} />`);
    expect(at("TrendingTier")).toBeGreaterThan(0);
    expect(at("TrendingTier")).toBeLessThan(at("NewsTier"));
    expect(at("NewsTier")).toBeLessThan(at("FriendsWatchedTier"));
    const tiers = readFileSync(path.join(import.meta.dirname, "../src/components/home/tiers.tsx"), "utf8");
    const news = tiers.slice(tiers.indexOf("export async function NewsTier"), tiers.indexOf("export async function LandingSoonTier"));
    const trending = tiers.slice(tiers.indexOf("export async function TrendingTier"));
    // The same order as Trending, which it follows in the source; no longer phones only.
    expect(news).toMatch(/className="order-6 /);
    expect(trending).toMatch(/className="order-6 /);
    expect(news).not.toMatch(/lg:hidden/);
    expect(news).toMatch(/slice\(0, NEWS_RAIL\)/);
    expect(tiers).toMatch(/const NEWS_RAIL = 5;/);
  });
});

describe("the migration", () => {
  it("adds the columns and tables, and carries the old news switch into the people switch", async () => {
    const { default: Database } = await import("better-sqlite3");
    const sql = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20260925120000_news_app/migration.sql"), "utf8");
    const mem = new Database(":memory:");
    mem.exec(`
      CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "notifyNews" BOOLEAN NOT NULL DEFAULT false);
      CREATE TABLE "NewsItem" ("id" TEXT NOT NULL PRIMARY KEY, "subject" TEXT NOT NULL, "headline" TEXT NOT NULL);
      INSERT INTO "User" ("id", "notifyNews") VALUES ('on', 1), ('off', 0);
      INSERT INTO "NewsItem" ("id", "subject", "headline") VALUES ('p1', 'press', 'Old headline');
    `);
    mem.exec(sql);
    expect(mem.prepare(`SELECT "id", "notifyNews", "notifyNewsPeople", "newsOpenOn", "newsMarkOnOpen", "newsKeepDays" FROM "User" ORDER BY "id"`).all()).toEqual([
      { id: "off", notifyNews: 0, notifyNewsPeople: 0, newsOpenOn: "for-you", newsMarkOnOpen: 1, newsKeepDays: 30 },
      { id: "on", notifyNews: 1, notifyNewsPeople: 1, newsOpenOn: "for-you", newsMarkOnOpen: 1, newsKeepDays: 30 },
    ]);
    expect(mem.prepare(`SELECT "id", "tag", "summary", "feedUrl" FROM "NewsItem"`).all()).toEqual([{ id: "p1", tag: null, summary: null, feedUrl: null }]);
    mem.exec(`INSERT INTO "UserFeed" ("id", "userId", "url", "name") VALUES ('f1', 'on', 'https://a/rss', 'A')`);
    expect(() => mem.exec(`INSERT INTO "UserFeed" ("id", "userId", "url", "name") VALUES ('f2', 'on', 'https://a/rss', 'A')`)).toThrow(/UNIQUE/);
    mem.exec(`INSERT INTO "NewsSource" ("userId", "feedUrl", "enabled") VALUES ('on', 'https://a/rss', 0)`);
  });
});

describe("review fixes", () => {
  it("folds the feed thirty cards at a time until the rows run out", async () => {
    const { feedFold, FEED_STEP } = await import("@/lib/news-chips");
    expect(FEED_STEP).toBe(30);
    expect(feedFold(143, 0)).toEqual({ shown: 30, next: 30 });
    expect(feedFold(143, 3)).toEqual({ shown: 120, next: 23 });
    expect(feedFold(143, 4)).toEqual({ shown: 143, next: 0 });
    expect(feedFold(143, 9)).toEqual({ shown: 143, next: 0 });
    expect(feedFold(12, 0)).toEqual({ shown: 12, next: 0 });
    expect(feedFold(0, 0)).toEqual({ shown: 0, next: 0 });
    const page = readFileSync(path.join(import.meta.dirname, "../src/app/(app)/news/page.tsx"), "utf8");
    expect(page).toMatch(/<FeedFold /);
  });

  it("keeps Settings › News inside a phone's width", () => {
    const screen = readFileSync(path.join(import.meta.dirname, "../src/components/settings/screen.tsx"), "utf8");
    const pre = /<pre className="([^"]*)"/.exec(screen)?.[1].split(" ") ?? [];
    expect(pre).toEqual(expect.arrayContaining(["overflow-x-auto", "max-w-full", "min-w-full", "w-0"]));
    expect(screen).toMatch(/title="News"[^>]*className="min-w-0"/);
    const controls = readFileSync(path.join(import.meta.dirname, "../src/components/settings/news-controls.tsx"), "utf8");
    expect(controls.match(/segmentOption\} whitespace-nowrap/g)).toHaveLength(2);
  });

  it("a trailer card without a picture names its source small, not its headline twice", () => {
    const bare = press({ tag: "trailer", source: "Collider" });
    const [card] = trailersFrom([], [bare], new Map(), NOW);
    expect(card).toMatchObject({ imageUrl: null, backdrop: null, poster: null, source: "Collider" });
    const rail = readFileSync(path.join(import.meta.dirname, "../src/components/news/trailer-rail.tsx"), "utf8");
    expect(rail).toMatch(/<NewsPicture imageUrl=\{c\.imageUrl\} source=\{c\.source \?\? c\.title\}/);
  });
});

describe("second review", () => {
  it("every Settings › News write makes the pages read again", () => {
    const actions = readFileSync(path.join(import.meta.dirname, "../src/lib/news-settings-actions.ts"), "utf8");
    const exported = actions.split("export async function ").slice(1);
    expect(exported.map((a) => a.slice(0, a.indexOf("(")))).toEqual([
      "saveNewsSource",
      "addNewsFeed",
      "saveNewsFeed",
      "deleteNewsFeed",
      "saveNewsPush",
      "saveNewsReading",
    ]);
    for (const body of exported) expect(body).toMatch(/attempt\(user\.id,|invalidate\(user\.id\)/);
    expect(actions).toMatch(/function invalidate\(userId: string\) \{\s+updateTag\(bellTag\(userId\)\);\s+refresh\(\);/);
    const screen = readFileSync(path.join(import.meta.dirname, "../src/components/settings/screen.tsx"), "utf8");
    expect(screen).toMatch(/<NewsPushSwitch topic="news" /);
    expect(screen).toMatch(/<NewsPushSwitch topic="news-people" /);
  });

  it("draws an own feed's headlines even when a hundred of the instance's are newer", async () => {
    process.env.NEWS_FEEDS = "https://a.test/feed";
    const me = await freshUser();
    const own = "https://own.test/rss";
    await db.userFeed.create({ data: { userId: me.id, url: own, name: "Own" } });
    const row = (n: number, feedUrl: string, hours: number) => ({
      headline: `${feedUrl === own ? "Own" : "Instance"} ${n}`,
      link: `${feedUrl}/${n}`,
      source: "S",
      imageUrl: null,
      at: new Date(Date.now() - hours * 3_600_000),
      match: null,
      feedUrl,
    });
    await recordPress(Array.from({ length: 100 }, (_, i) => row(i, "https://a.test/feed", 1 + i / 100)));
    await recordPress(Array.from({ length: 18 }, (_, i) => row(i, own, 48 + i)));
    const { pressForReader, PAGE_PRESS_CAP } = await import("@/lib/news-page");
    const rows = await pressForReader(me.id, 30);
    expect(PAGE_PRESS_CAP).toBe(400);
    expect(rows).toHaveLength(118);
    expect(rows.filter((r) => r.feedUrl === own)).toHaveLength(18);
    // The Round 9 default of eighty is what used to leave them off.
    expect((await pressNews({ feeds: await visibleFeeds(me.id) })).some((r) => r.feedUrl === own)).toBe(false);
  });

  it("finds the picture an article names in its head, and none in its body", async () => {
    const { ogImageOf } = await import("@/lib/press");
    expect(ogImageOf(fixture("article-with-og.html"), "https://example.com/a")).toBe("https://cdn.example.com/2026/09/invented-show.jpg?w=1024");
    expect(ogImageOf(fixture("article-without-og.html"), "https://example.com/b")).toBeNull();
    expect(ogImageOf(`<head><meta name="twitter:image" content="/img/t.jpg"></head>`, "https://example.com/c")).toBe("https://example.com/img/t.jpg");
    expect(ogImageOf(`<head><meta property="og:image" content="http://example.com/insecure.jpg"></head>`, "https://example.com/d")).toBeNull();
  });

  it("looks each picture-less headline up once, fails soft, and never asks again of a page that had none", async () => {
    const { lookUpPictures } = await import("@/lib/press");
    const base = { headline: "H", source: "The Hollywood Reporter", imageUrl: null, match: null };
    await recordPress([
      { ...base, link: "https://thr.test/with", at: new Date(NOW.getTime() - 1_000) },
      { ...base, link: "https://thr.test/without", at: new Date(NOW.getTime() - 2_000) },
      { ...base, link: "https://thr.test/down", at: new Date(NOW.getTime() - 3_000) },
      { ...base, link: "https://thr.test/older", at: new Date(NOW.getTime() - 4_000) },
    ]);
    const asked: string[] = [];
    const read = async (url: string) => {
      asked.push(url);
      if (url.endsWith("/with")) return fixture("article-with-og.html");
      if (url.endsWith("/without")) return fixture("article-without-og.html");
      return null;
    };
    // Newest first, as many as asked for.
    expect(await lookUpPictures(3, read)).toEqual({ asked: 3, found: 1 });
    expect(asked.sort()).toEqual(["https://thr.test/down", "https://thr.test/with", "https://thr.test/without"]);
    const pictures = Object.fromEntries((await db.newsItem.findMany({ where: { subject: "press" } })).map((r) => [r.link, r.imageUrl]));
    expect(pictures).toEqual({
      "https://thr.test/with": "https://cdn.example.com/2026/09/invented-show.jpg?w=1024",
      "https://thr.test/without": "",
      "https://thr.test/down": null,
      "https://thr.test/older": null,
    });
    // "" is looked at and never asked again; the one that did not answer is.
    asked.length = 0;
    await lookUpPictures(20, read);
    expect(asked.sort()).toEqual(["https://thr.test/down", "https://thr.test/older"]);
    expect((await pressNews()).find((r) => r.link === "https://thr.test/without")?.imageUrl).toBeNull();
  });

  it("reads 512 KB of an article's head at most, asks for a range, and follows two redirects, not three", async () => {
    const { fetchHead, HEAD_BYTES } = await import("@/lib/press");
    const original = globalThis.fetch;
    const calls: { url: string; range: string | null }[] = [];
    let pulled = 0;
    const big = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulled += 16 * 1024;
            if (pulled > 1024 * 1024) {
              controller.close();
              return;
            }
            controller.enqueue(new TextEncoder().encode("<p>".padEnd(16 * 1024, "x")));
          },
        }),
        { status: 206, headers: { "content-type": "text/html" } },
      );
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, range: new Headers(init?.headers).get("range") });
      const hop = /hop(\d)/.exec(url);
      if (hop && Number(hop[1]) < 3) return new Response(null, { status: 301, headers: { location: `https://r.test/hop${Number(hop[1]) + 1}` } });
      if (url === "https://r.test/big") return big();
      return new Response(fixture("article-with-og.html"), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as typeof fetch;
    try {
      const text = await fetchHead("https://r.test/big");
      expect(text!.length).toBeLessThanOrEqual(HEAD_BYTES);
      expect(pulled).toBeLessThan(HEAD_BYTES + 32 * 1024);
      expect(calls[0].range).toBe(`bytes=0-${HEAD_BYTES - 1}`);
      calls.length = 0;
      // hop1, hop2, hop3: two redirects, then the page.
      expect(await fetchHead("https://r.test/hop1")).not.toBeNull();
      calls.length = 0;
      // hop0 to hop3 is three redirects: given up.
      expect(await fetchHead("https://r.test/hop0")).toBeNull();
      expect(calls).toHaveLength(3);
    } finally {
      globalThis.fetch = original;
    }
  }, 15_000);

  it("names the channel when a chip has nothing for it", async () => {
    const { nothingUnder } = await import("@/lib/news-words");
    expect(nothingUnder("Top", null)).toBe("Nothing under Top yet.");
    expect(nothingUnder("Top", "Silo")).toBe("Nothing under Top for Silo yet.");
    expect(nothingUnder("Trailers", "Silo", true)).toBe("Nothing else under Trailers for Silo yet.");
  });

  it("with Mark read when opened off, opening a story leaves it unread", async () => {
    const { markOnOpening } = await import("@/lib/news-words");
    const { newsFor } = await import("@/lib/news");
    const { markRead } = await import("@/lib/notifications");
    const me = await freshUser();
    await db.followedPerson.create({ data: { userId: me.id, personId: 3497, followedAt: new Date(Date.now() - 86_400_000) } });
    await db.newsItem.create({
      data: {
        subject: "person",
        subjectId: 3497,
        kind: "announced",
        mediaType: "tv",
        tmdbId: 1,
        title: "Snow Ponies",
        headline: "New from Jon Bernthal",
        detail: "Snow Ponies announced",
        key: "person:3497:tv-1:announced",
      },
    });
    await setReadingPref(me.id, "markOnOpen", false);
    const prefs = await newsPrefs(me.id);
    const [row] = await newsFor(me.id);
    // What a card does on opening: the bell's mark, only for the key the rule gives.
    const key = markOnOpening(row, prefs.markOnOpen);
    if (key) await markRead(me.id, key);
    expect(key).toBeNull();
    expect((await newsFor(me.id))[0].read).toBe(false);
    expect(await db.notificationRead.count({ where: { userId: me.id } })).toBe(0);
    // On, the same opening marks it.
    const on = markOnOpening(row, true);
    if (on) await markRead(me.id, on);
    expect((await newsFor(me.id))[0].read).toBe(true);
  });

  it("a card with no picture of any kind draws the placeholder, from one component", () => {
    const place = readFileSync(path.join(import.meta.dirname, "../src/components/news/no-picture.tsx"), "utf8");
    expect(place).toMatch(/<TrekkerMark /);
    expect(place).toMatch(/bg-surface-2/);
    for (const file of ["press-cards.tsx", "your-cards.tsx", "trailer-rail.tsx"]) {
      const source = readFileSync(path.join(import.meta.dirname, `../src/components/news/${file}`), "utf8");
      expect(source).toMatch(/from "\.\/no-picture"/);
    }
  });
});

describe("third review", () => {
  /**
   * A 600 KB page as a stream in odd-sized chunks, with multibyte characters
   * across chunk edges: by default its og:image at about 300 KB and
   * `</head>` at about 320 KB, where the fifth review measured them on The
   * Hollywood Reporter's pages. Sizes are in bytes; the filler is 15 bytes
   * for every 10 characters.
   */
  function bigPage(ogAt = 300_000, headAt = 320_000, total = 600_000) {
    const filler = (bytes: number) => "<!-- é’ —".repeat(Math.ceil(bytes / 15) + 1).slice(0, Math.max(0, Math.round((bytes * 10) / 15)));
    const tag = `<meta property="og:title" content="Invented"><meta property="og:image" content="https://cdn.example.com/deep.jpg">`;
    const html =
      `<!doctype html><html><head><meta charset="utf-8"><title>Invented | Example Reporter</title>` +
      filler(ogAt) +
      tag +
      filler(headAt - ogAt - tag.length) +
      `</head><body>` +
      filler(total - headAt) +
      `</body></html>`;
    const bytes = new TextEncoder().encode(html);
    const tagAt = new TextEncoder().encode(html.slice(0, html.indexOf(tag) + tag.length)).length;
    let at = 0;
    let served = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) {
          controller.close();
          return;
        }
        const size = 4_093; // odd, so chunks split multibyte characters
        controller.enqueue(bytes.slice(at, at + size));
        at += size;
        served = at;
      },
    });
    return { stream, served: () => served, total: bytes.length, tagEnd: tagAt };
  }

  async function withFetch<T>(answer: (url: string, init?: RequestInit) => Response, run: () => Promise<T>) {
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => answer(String(input), init)) as typeof fetch;
    try {
      return await run();
    } finally {
      globalThis.fetch = original;
    }
  }

  it("finds og:image in a 600 KB page that ignores the Range header, reading no further than it must", async () => {
    const { fetchHead, ogImageOf, HEAD_BYTES } = await import("@/lib/press");
    const page = bigPage();
    const html = await withFetch(
      () => new Response(page.stream, { status: 200, headers: { "content-type": "text/html; charset=UTF-8", "content-length": String(page.total) } }),
      () => fetchHead("https://thr.test/article/"),
    );
    expect(html).not.toBeNull();
    expect(ogImageOf(html!, "https://thr.test/article/")).toBe("https://cdn.example.com/deep.jpg");
    // The tag is about 300 KB in, past the old 64 KB cap and inside the new one.
    expect(page.tagEnd).toBeGreaterThan(256 * 1024);
    expect(HEAD_BYTES).toBe(512 * 1024);
    // Stopped at the tag, before `</head>`, never near the whole page: the stream runs a chunk ahead of the reader, so two at most past it.
    expect(page.served()).toBeLessThanOrEqual(page.tagEnd + 2 * 4_093);
    expect(page.served()).toBeLessThan(320_000);
    expect(html).not.toMatch(/�/);
  });

  it("stops reading right after the picture's tag, however far off `</head>` is", async () => {
    const { fetchHead, ogImageOf } = await import("@/lib/press");
    const page = bigPage(100_000, 450_000);
    const html = await withFetch(
      () => new Response(page.stream, { status: 200, headers: { "content-type": "text/html" } }),
      () => fetchHead("https://iw.test/article/"),
    );
    expect(ogImageOf(html!, "https://iw.test/article/")).toBe("https://cdn.example.com/deep.jpg");
    expect(page.served()).toBeGreaterThanOrEqual(page.tagEnd);
    expect(page.served()).toBeLessThanOrEqual(page.tagEnd + 2 * 4_093);
  });

  it("sends no user agent of its own, which the sites answered with a different page", async () => {
    const { fetchHead } = await import("@/lib/press");
    let agent: string | null = "unset";
    await withFetch(
      (_url, init) => {
        agent = new Headers(init?.headers).get("user-agent");
        return new Response("<html><head></head></html>", { status: 200, headers: { "content-type": "text/html" } });
      },
      () => fetchHead("https://thr.test/a"),
    );
    expect(agent).toBeNull();
  });

  it("only a real article head with no picture marks a row looked-at; every failure leaves it for the next pass", async () => {
    const { lookUpPictures } = await import("@/lib/press");
    const base = { headline: "H", source: "IndieWire", imageUrl: null, match: null };
    const links = ["error", "timeout", "json", "wall", "none"].map((k) => `https://iw.test/${k}`);
    await recordPress(links.map((link, i) => ({ ...base, link, at: new Date(NOW.getTime() - i * 1_000) })));
    await withFetch(
      (url) => {
        if (url.endsWith("/error")) return new Response("gone", { status: 503, headers: { "content-type": "text/html" } });
        if (url.endsWith("/timeout")) throw new DOMException("The operation timed out.", "TimeoutError");
        if (url.endsWith("/json")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
        // A 200 page that is not the article (a consent or bot wall): no og: tags at all.
        if (url.endsWith("/wall")) return new Response("<html><head><title>Just a moment</title></head></html>", { status: 200, headers: { "content-type": "text/html" } });
        return new Response(fixture("article-without-og.html"), { status: 200, headers: { "content-type": "text/html" } });
      },
      () => lookUpPictures(10),
    );
    const marks = Object.fromEntries((await db.newsItem.findMany({ where: { subject: "press" } })).map((r) => [r.link, r.imageUrl]));
    expect(marks).toEqual({
      "https://iw.test/error": null,
      "https://iw.test/timeout": null,
      "https://iw.test/json": null,
      "https://iw.test/wall": null,
      "https://iw.test/none": "",
    });
  }, 15_000);

  it("a settings control takes a newer server value, so a reload painted from the worker's cache ends right", () => {
    const controls = readFileSync(path.join(import.meta.dirname, "../src/components/settings/controls.tsx"), "utf8");
    const hook = controls.slice(controls.indexOf("export function useSaved"), controls.indexOf("export function Problem"));
    expect(hook).toMatch(/if \(JSON\.stringify\(seen\) !== JSON\.stringify\(initial\)\) \{\s+setSeen\(initial\);\s+setValue\(initial\);/);
    const news = readFileSync(path.join(import.meta.dirname, "../src/components/settings/news-controls.tsx"), "utf8");
    expect(news).toMatch(/if \(seen !== fresh\) \{\s+setSeen\(fresh\);\s+setSources\(initialSources\);\s+setFeeds\(initialFeeds\);/);
    // Every News switch and picker goes through the hook.
    expect(news.match(/useSaved\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("the desktop cast grid only ever shows whole rows", () => {
    const sections = readFileSync(path.join(import.meta.dirname, "../src/components/title/sections.tsx"), "utf8");
    const rail = /<Rail\s+label=\{title\}\s+className="([^"]*)"/.exec(sections.slice(sections.indexOf("export function CastRail")))?.[1].split(" ") ?? [];
    expect(rail).toEqual(
      expect.arrayContaining(["lg:grid-rows-[repeat(2,auto)]", "lg:auto-rows-[0]", "lg:gap-y-0", "lg:overflow-hidden", "lg:pb-0", "lg:-mb-5"]),
    );
    // The column count is as it was: as many fixed tracks as fit.
    expect(rail).toContain("lg:grid-cols-[repeat(auto-fill,var(--poster-desk))]");
    // Row spacing is each tile's own margin, so a collapsed row takes no space.
    expect(sections).toMatch(/className="w-\[92px\] lg:mb-5 lg:w-full"/);
  });
});

describe("fourth review", () => {
  it("the lead carousel takes three stories by the lead's rule", async () => {
    const { chooseLeads, LEAD_COUNT } = await import("@/lib/news-page");
    const title = { mediaType: "tv" as const, tmdbId: 1, title: "Lanterns", poster: null };
    const plain = press({ at: hoursAgo(1) });
    const p1 = press({ at: hoursAgo(2), imageUrl: "https://example.com/1.jpg" });
    const m1 = press({ at: hoursAgo(3), imageUrl: "https://example.com/2.jpg", match: title });
    const p2 = press({ at: hoursAgo(4), imageUrl: "https://example.com/3.jpg" });
    const p3 = press({ at: hoursAgo(5), imageUrl: "https://example.com/4.jpg" });
    expect(LEAD_COUNT).toBe(3);
    expect(chooseLeads([plain, p1, m1, p2, p3]).map((r) => r.id)).toEqual([m1.id, p1.id, p2.id]);
    // The first is the old single lead.
    expect(chooseLeads([plain, p1, m1, p2, p3])[0].id).toBe(chooseLead([plain, p1, m1, p2, p3])!.id);
    expect(chooseLeads([plain])).toEqual([]);
  });

  it("the feed has exactly one pair of big cards, first: the first two headlines with a picture", async () => {
    const { arrangeFeed } = await import("@/lib/news-page");
    const pic = (h: number) => ({ type: "press" as const, row: press({ at: hoursAgo(h), imageUrl: `https://example.com/${h}.jpg`, summary: "A line." }) });
    const bare = (h: number) => ({ type: "press" as const, row: press({ at: hoursAgo(h) }) });
    const mine = (h: number) => ({ type: "yours" as const, row: yours({ at: hoursAgo(h) }) });
    // A picture-less row and one of yours in the first two: the next rows with a picture take the slots.
    const entries = [bare(1), mine(2), pic(3), bare(4), pic(5), pic(6), pic(7), ...Array.from({ length: 40 }, (_, i) => pic(10 + i))];
    const laid = arrangeFeed(entries);
    expect(laid.filter((l) => l.big)).toHaveLength(2);
    expect(laid.slice(0, 2).map((l) => [l.entry, l.big])).toEqual([
      [entries[2], true],
      [entries[4], true],
    ]);
    // The rest keep their order, all small, through every page of thirty.
    expect(laid.slice(2).map((l) => l.entry)).toEqual(entries.filter((_, i) => i !== 2 && i !== 4));
    expect(laid.slice(2).every((l) => !l.big)).toBe(true);
    // Your news is never big; with no pictures at all there are none.
    expect(arrangeFeed([mine(1), mine(2), bare(3)]).some((l) => l.big)).toBe(false);
    expect(arrangeFeed([])).toEqual([]);
  });

  it("the lead carousel is Discover's, from the same pieces, with no animation loop", () => {
    const lead = readFileSync(path.join(import.meta.dirname, "../src/components/news/lead-carousel.tsx"), "utf8");
    expect(lead).toContain('from "../discover/carousel.module.css"');
    expect(lead).toMatch(/import \{ CarouselFrame, DwellArt \} from "\.\.\/discover\/top-carousel"/);
    expect(lead).toContain("<CarouselFrame");
    expect(lead).toContain("<DwellArt");
    expect(lead).toMatch(/<NewsPicture [^>]*\bstill\b/);
    // Its only clock is `useCarousel`'s setTimeout chain; it keeps none of its own.
    expect(lead).not.toMatch(/requestAnimationFrame|setInterval|setTimeout\(/);
    const top = readFileSync(path.join(import.meta.dirname, "../src/components/discover/top-carousel.tsx"), "utf8");
    expect(top).toContain("<CarouselFrame");
    expect(top).toContain("useCarousel(count)");
    const style = readFileSync(path.join(import.meta.dirname, "../STYLE.md"), "utf8");
    expect(style).toMatch(/the News page's lead stories/);
  });

  it("New trailers stands under the lead, above the feed, at both widths", () => {
    const page = readFileSync(path.join(import.meta.dirname, "../src/app/(app)/news/page.tsx"), "utf8");
    const lead = page.indexOf("<LeadCarousel");
    const trailers = page.indexOf("<TrailerRail");
    const feed = page.indexOf('aria-labelledby="feed-head"');
    expect(lead).toBeGreaterThan(0);
    expect(trailers).toBeGreaterThan(lead);
    expect(feed).toBeGreaterThan(trailers);
    expect(page.match(/<TrailerRail/g)).toHaveLength(1);
  });
});

describe("last review", () => {
  it("a feed picture that fails to load leaves the placeholder beneath it, never a blank", () => {
    const img = readFileSync(path.join(import.meta.dirname, "../src/components/news/feed-img.tsx"), "utf8");
    expect(img.startsWith('"use client";')).toBe(true);
    expect(img).toMatch(/onError=\{\(e\) => \{\s+e\.currentTarget\.hidden = true;/);
    // One that failed before hydration is caught too.
    expect(img).toMatch(/img\.complete && img\.naturalWidth === 0/);
    const place = readFileSync(path.join(import.meta.dirname, "../src/components/news/no-picture.tsx"), "utf8");
    const branch = place.slice(place.indexOf("if (imageUrl) {"), place.indexOf("if (backdrop) {"));
    expect(branch.indexOf("<NoPicture")).toBeGreaterThan(0);
    expect(branch.indexOf("<FeedImg")).toBeGreaterThan(branch.indexOf("<NoPicture"));
    // No other raw <img> for a feed's picture in the news components; the lead carousel draws through NewsPicture.
    for (const file of ["press-cards.tsx", "your-cards.tsx", "trailer-rail.tsx", "lead-carousel.tsx"]) {
      expect(readFileSync(path.join(import.meta.dirname, `../src/components/news/${file}`), "utf8")).not.toMatch(/<img\b/);
    }
  });
});
