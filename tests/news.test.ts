import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { addDays, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { filmNews, markNewsRead, newsFor, personNewsDraft, record, showNews, unreadNews } from "@/lib/news";
import { deriveNotifications, markRead } from "@/lib/notifications";
import { queue, refreshShow } from "@/lib/refresh";
import type { MovieDetails, TvDetails } from "@/lib/tmdb";
import { freshUser } from "./helpers/db";
import { stubTmdb } from "./helpers/tmdb-fetch";

/*
 * T2, news: what changed between the answer the job held and the one it
 * fetched is news once, whatever the kind; a status flapping back is not news
 * twice; a followed person's credit still records; and whose news it is, and
 * whether they have read it, is worked out on reading. No network: TMDB is
 * the stub.
 */

const today = todayKey();
/** A fixed day for the words that carry a year only outside this one. */
const DAY = "2026-09-24";
let stub: ReturnType<typeof stubTmdb> | null = null;

afterEach(async () => {
  await queue.idle();
  stub?.restore();
  stub = null;
});

function show(overrides: Partial<TvDetails> = {}): TvDetails {
  return {
    id: 95396,
    name: "Severance",
    overview: "",
    poster_path: "/sev.jpg",
    backdrop_path: null,
    vote_average: 8,
    vote_count: 100,
    tagline: "",
    status: "Returning Series",
    genres: [],
    first_air_date: "2022-02-18",
    last_air_date: "2025-03-21",
    episode_run_time: [50],
    number_of_seasons: 2,
    number_of_episodes: 19,
    last_episode_to_air: null,
    next_episode_to_air: null,
    seasons: [],
    videos: { results: [] },
    ...overrides,
  };
}

function film(overrides: Partial<MovieDetails> = {}): MovieDetails {
  return {
    id: 693134,
    title: "Dune: Part Three",
    overview: "",
    poster_path: "/dune.jpg",
    backdrop_path: null,
    vote_average: 0,
    vote_count: 0,
    tagline: "",
    status: "In Production",
    genres: [],
    runtime: null,
    release_date: "2026-12-18",
    belongs_to_collection: null,
    videos: { results: [] },
    ...overrides,
  };
}

const trailer = (key: string, name = "Official Trailer") => ({ key, site: "YouTube", type: "Trailer", official: true, name });

describe("what changed about a show", () => {
  it("is nothing on the first fetch: that only draws the line", () => {
    expect(showNews(null, show({ status: "Canceled" }), today)).toEqual([]);
  });

  it("says renewed, cancelled or ended when the status changes into one", () => {
    expect(showNews(show(), show({ status: "Canceled" }), today)).toMatchObject([
      { kind: "cancelled", headline: "Severance cancelled", key: "tv:95396:status:cancelled" },
    ]);
    expect(showNews(show(), show({ status: "Ended" }), today)).toMatchObject([{ kind: "ended", headline: "Severance has ended" }]);
    expect(showNews(show({ status: "Ended" }), show(), today)).toMatchObject([{ kind: "renewed", headline: "Severance renewed" }]);
    // In production becoming returning is a premiere, which the next date says, not a renewal.
    expect(showNews(show({ status: "In Production" }), show(), today)).toEqual([]);
  });

  it("announces a new season when the count rises", () => {
    expect(showNews(show(), show({ number_of_seasons: 3 }), today)).toMatchObject([
      { kind: "new-season", headline: "Severance renewed for season 3", detail: "Season 3 announced", key: "tv:95396:season:3" },
    ]);
  });

  it("gives a next-episode date once, then says when it moves", () => {
    const next = (air_date: string) => ({ season_number: 3, episode_number: 1, air_date, name: "Hello, Ms. Cobel" });
    const d1 = addDays(today, 40);
    const d2 = addDays(today, 47);
    const dated = showNews(show(), show({ next_episode_to_air: next(d1) }), today);
    expect(dated).toMatchObject([{ kind: "next-date", key: "tv:95396:next:S03 · E01" }]);
    expect(dated[0].headline).toMatch(/^Severance returns /);
    expect(showNews(show({ next_episode_to_air: next(d1) }), show({ next_episode_to_air: next(d1) }), today)).toEqual([]);
    const moved = showNews(show({ next_episode_to_air: next(d1) }), show({ next_episode_to_air: next(d2) }), today);
    expect(moved).toMatchObject([{ kind: "date-moved", key: `tv:95396:moved:S03 · E01:${d2}` }]);
    expect(moved[0].headline).toMatch(/^Severance moves to /);
  });

  it("says a new trailer once, by its key", () => {
    const before = show({ videos: { results: [trailer("a")] } });
    const after = show({ videos: { results: [trailer("a"), trailer("b", "Season 3 Trailer"), { ...trailer("c"), type: "Teaser" }] } });
    expect(showNews(before, after, today)).toMatchObject([{ kind: "trailer", detail: "Season 3 Trailer", key: "tv:95396:trailer:b" }]);
  });
});

describe("what changed about a saved film", () => {
  it("says a release date set or moved, and a new trailer", () => {
    expect(filmNews(film({ release_date: "" }), film(), today)).toMatchObject([{ kind: "release-date", key: "movie:693134:release:2026-12-18" }]);
    const moved = filmNews(film(), film({ release_date: "2027-03-05" }), DAY);
    expect(moved).toMatchObject([{ kind: "release-date", headline: "Dune: Part Three moves to 5 Mar 2027" }]);
    expect(filmNews(film(), film({ videos: { results: [trailer("t")] } }), today)).toMatchObject([{ kind: "trailer", key: "movie:693134:trailer:t" }]);
    expect(filmNews(null, film(), today)).toEqual([]);
  });
});

describe("recording", () => {
  it("writes each change once, and a status flapping back is not news twice", async () => {
    const ended = showNews(show(), show({ status: "Ended" }), today);
    expect(await record(ended)).toBe(1);
    expect(await record(showNews(show({ status: "Ended" }), show(), today))).toBe(1); // renewed
    expect(await record(showNews(show(), show({ status: "Ended" }), today))).toBe(0); // ended again: same key
    expect(await db.newsItem.count({ where: { subject: "tv", subjectId: 95396 } })).toBe(2);
  });

  it("notices a change as the six-hourly pass writes the newer answer", async () => {
    const userId = (await freshUser()).id;
    // Saved rather than in progress: the refresh works out progress from plays, and this person has none.
    await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: 95396, title: "Severance" } });
    const routes = (status: string) => ({ "/tv/95396": show({ status, seasons: [] }) });
    stub = stubTmdb(routes("Returning Series"));
    await refreshShow(95396, { force: true });
    expect(await db.newsItem.count()).toBe(0);
    stub.restore();
    stub = stubTmdb(routes("Canceled"));
    await refreshShow(95396, { force: true });
    const news = await newsFor(userId);
    expect(news).toMatchObject([{ headline: "Severance cancelled", read: false }]);
  });
});

describe("whose news it is", () => {
  it("a followed person's since the follow, a show in progress or saved, a saved film; not a show stopped", async () => {
    const userId = (await freshUser()).id;
    const followedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.followedPerson.create({ data: { userId, personId: 3497, followedAt } });
    await db.titleState.create({ data: { userId, showId: 95396, showName: "Severance" } });
    await db.watchlistItem.create({ data: { userId, mediaType: "movie", tmdbId: 693134, title: "Dune: Part Three" } });
    await db.titleState.create({ data: { userId, showId: 1, showName: "Stopped" } });
    await db.droppedShow.create({ data: { userId, showId: 1, showName: "Stopped" } });

    const person = { id: 3497, name: "Kyle Chandler", profilePath: null };
    await db.newsItem.create({
      data: { ...personNewsDraft(person, { mediaType: "tv", tmdbId: 2, title: "Old", kind: "announced" }), at: new Date(followedAt.getTime() - 1000) },
    });
    await record([personNewsDraft(person, { mediaType: "tv", tmdbId: 3, title: "Lanterns", kind: "announced" })]);
    await record(showNews(show(), show({ status: "Canceled" }), today));
    await record(filmNews(film({ release_date: "" }), film(), DAY));
    await record(showNews(show({ id: 1, name: "Stopped" }), show({ id: 1, name: "Stopped", status: "Ended" }), today));
    // Somebody else's show: not theirs.
    await record(showNews(show({ id: 7, name: "Other" }), show({ id: 7, name: "Other", status: "Ended" }), today));

    const news = await newsFor(userId);
    expect(news.map((n) => n.headline).sort()).toEqual(["Dune: Part Three dated 18 Dec", "New from Kyle Chandler", "Severance cancelled"].sort());
    expect(news.find((n) => n.subject === "person")).toMatchObject({ detail: "Lanterns announced", mediaType: "tv", tmdbId: 3 });
  });
});

describe("read state", () => {
  it("is the bell's: a row opened is read everywhere, and Mark all read reads the rest", async () => {
    const userId = (await freshUser()).id;
    await db.titleState.create({ data: { userId, showId: 95396, showName: "Severance" } });
    await record(showNews(show(), show({ status: "Canceled", number_of_seasons: 3 }), today));
    expect(await unreadNews(userId)).toBe(2);

    const bell = await deriveNotifications(userId);
    const notes = bell.items.filter((i) => i.kind === "news");
    expect(notes).toHaveLength(2);
    await markRead(userId, notes[0].key);
    expect(await unreadNews(userId)).toBe(1);

    expect(await markNewsRead(userId)).toBe(1);
    expect(await unreadNews(userId)).toBe(0);
    expect((await deriveNotifications(userId)).items.filter((i) => i.kind === "news" && !i.read)).toHaveLength(0);
  });
});

describe("the migration", () => {
  it("carries every PersonNews row over with its id and the bell's words, then drops the table", () => {
    const sql = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20260924235000_news/migration.sql"), "utf8");
    const mem = new Database(":memory:");
    mem.exec(`
      CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "Person" ("tmdbId" INTEGER NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "profilePath" TEXT);
      CREATE TABLE "PersonNews" ("id" TEXT NOT NULL PRIMARY KEY, "personId" INTEGER NOT NULL, "mediaType" TEXT NOT NULL, "tmdbId" INTEGER NOT NULL, "title" TEXT NOT NULL, "kind" TEXT NOT NULL, "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX "PersonNews_personId_mediaType_tmdbId_kind_key" ON "PersonNews"("personId", "mediaType", "tmdbId", "kind");
      CREATE INDEX "PersonNews_personId_at_idx" ON "PersonNews"("personId", "at");
      INSERT INTO "Person" VALUES (3497, 'Kyle Chandler', '/kc.jpg');
      INSERT INTO "PersonNews" ("id", "personId", "mediaType", "tmdbId", "title", "kind") VALUES ('n1', 3497, 'tv', 2, 'Lanterns', 'announced');
      INSERT INTO "PersonNews" ("id", "personId", "mediaType", "tmdbId", "title", "kind") VALUES ('n2', 9, 'movie', 5, 'Heist', 'released');
      INSERT INTO "User" VALUES ('u');
    `);
    mem.exec(sql);
    const rows = mem.prepare(`SELECT "id", "subject", "subjectId", "headline", "detail", "image", "key" FROM "NewsItem" ORDER BY "id"`).all();
    expect(rows).toEqual([
      { id: "n1", subject: "person", subjectId: 3497, headline: "New from Kyle Chandler", detail: "Lanterns announced", image: "/kc.jpg", key: "person:3497:tv-2:announced" },
      { id: "n2", subject: "person", subjectId: 9, headline: "New from someone you follow", detail: "Heist is out", image: null, key: "person:9:movie-5:released" },
    ]);
    expect(mem.prepare(`SELECT name FROM sqlite_master WHERE name = 'PersonNews'`).all()).toEqual([]);
    expect(mem.prepare(`SELECT "notifyNews" FROM "User"`).get()).toEqual({ notifyNews: 0 });
  });
});
