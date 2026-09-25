import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { creditDates, isFollowing, newsBetween, recordPersonNews, SEED_CAP, seedNews, unseededPersonIds } from "@/lib/follow";
import { newsFor } from "@/lib/news";
import { checkFollowedPeople, queue } from "@/lib/refresh";
import { cacheKey, type PersonCredit, type PersonCrewCredit, type PersonDetails } from "@/lib/tmdb";
import { freshUser } from "./helpers/db";
import { stubTmdb } from "./helpers/tmdb-fetch";

/**
 * Following a person: the action writes and removes the row for whoever is
 * signed in, draws the person's line from the cache, and the daily look turns
 * what changed in their credits into `PersonNews`, once each.
 */

const signedIn = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => signedIn.user }));
vi.mock("next/cache", () => ({ refresh: vi.fn(), updateTag: vi.fn() }));

const { followPerson } = await import("@/lib/person-actions");

const today = todayKey();
const PERSON = 33192;

function person(cast: PersonCredit[] = [], crew: PersonCrewCredit[] = []): PersonDetails {
  return {
    id: PERSON,
    name: "Joel Edgerton",
    biography: "",
    birthday: null,
    deathday: null,
    place_of_birth: null,
    known_for_department: "Acting",
    profile_path: null,
    combined_credits: { cast, crew },
  };
}

const part = (id: number, title: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  media_type: "movie" as const,
  title,
  release_date: date,
  character: "Someone",
  ...extra,
});

async function cachePerson(details: PersonDetails) {
  const key = cacheKey(`/person/${PERSON}`, { append_to_response: "combined_credits" });
  await db.tmdbCache.create({ data: { key, body: JSON.stringify(details), expiresAt: new Date(Date.now() + 3_600_000) } });
  await db.person.create({ data: { tmdbId: PERSON, name: details.name } });
}

let userId: string;
beforeEach(async () => {
  userId = (await freshUser()).id;
  signedIn.user = { id: userId };
});

describe("Follow", () => {
  it("follows and unfollows the signed-in person, once however often it is pressed", async () => {
    await cachePerson(person([part(1, "Warrior", "2011-09-09")]));
    expect(await followPerson(PERSON, true)).toBe(true);
    expect(await followPerson(PERSON, true)).toBe(true);
    expect(await db.followedPerson.count({ where: { userId, personId: PERSON } })).toBe(1);
    expect(await isFollowing(userId, PERSON)).toBe(true);

    expect(await followPerson(PERSON, false)).toBe(true);
    expect(await isFollowing(userId, PERSON)).toBe(false);
  });

  it("draws the person's line from the cache on the first follow", async () => {
    await cachePerson(person([part(1, "Warrior", "2011-09-09")]));
    await followPerson(PERSON, true);
    const row = await db.person.findUniqueOrThrow({ where: { tmdbId: PERSON } });
    expect(JSON.parse(row.credits!)).toEqual({ "movie-1": "2011-09-09" });
    expect(row.creditsCheckedAt).not.toBeNull();
  });

  it("refuses without a session or with a nonsense id", async () => {
    signedIn.user = null;
    expect(await followPerson(PERSON, true)).toBe(false);
    signedIn.user = { id: userId };
    expect(await followPerson(-4, true)).toBe(false);
    expect(await db.followedPerson.count()).toBe(0);
  });

  it("goes with the account", async () => {
    await followPerson(PERSON, true);
    await db.user.delete({ where: { id: userId } });
    expect(await db.followedPerson.count()).toBe(0);
  });
});

describe("What is new in a followed person's work", () => {
  const future = addDays(today, 60);
  const yesterday = addDays(today, -1);
  const lastWeek = addDays(today, -7);

  it("has nothing to seed from a first look at old work only", () => {
    expect(newsBetween(null, null, { "movie-1": "2011-09-09" }, {}, today)).toEqual([]);
  });

  it("calls a new undated or future part announced, and a new recent one released", () => {
    const before = { "movie-1": "2011-09-09" };
    const now = { ...before, "movie-2": "", "tv-3": future, "movie-4": yesterday, "movie-5": "1999-01-01" };
    const titles = { "movie-2": "Untitled Heist", "tv-3": "Trigger Point", "movie-4": "Loving", "movie-5": "Old Find" };
    expect(newsBetween(before, lastWeek, now, titles, today)).toEqual([
      { mediaType: "movie", tmdbId: 2, title: "Untitled Heist", kind: "announced" },
      { mediaType: "tv", tmdbId: 3, title: "Trigger Point", kind: "announced" },
      { mediaType: "movie", tmdbId: 4, title: "Loving", kind: "released" },
    ]);
  });

  it("calls a known part released once its date passes", () => {
    const before = { "movie-2": "", "movie-3": future };
    const now = { "movie-2": yesterday, "movie-3": future };
    expect(newsBetween(before, lastWeek, now, { "movie-2": "Heist" }, today)).toEqual([
      { mediaType: "movie", tmdbId: 2, title: "Heist", kind: "released" },
    ]);
  });

  it("counts parts and directing, not appearances as themselves", () => {
    const details = person(
      [part(1, "Warrior", "2011-09-09"), part(2, "The Talk Show", "2020-01-01", { character: "Himself" })],
      [{ id: 9, media_type: "movie", title: "The Gift", release_date: "2015-08-07", job: "Director" }, { id: 10, media_type: "movie", title: "Catering", job: "Caterer" }],
    );
    expect(creditDates(details)).toEqual({ "movie-1": "2011-09-09", "movie-9": "2015-08-07" });
  });

  it("stores each piece of news once, and moves the line on", async () => {
    await db.person.create({
      data: { tmdbId: PERSON, name: "Joel Edgerton", credits: JSON.stringify({ "movie-1": "2011-09-09" }), creditsCheckedAt: new Date(`${lastWeek}T12:00:00`) },
    });
    const details = person([part(1, "Warrior", "2011-09-09"), part(2, "Heist", "")]);
    expect(await recordPersonNews(PERSON, details, today)).toHaveLength(1);
    expect(await recordPersonNews(PERSON, details, today)).toHaveLength(0);
    // A person's news is a `NewsItem` with them as its subject, in the words the bell uses.
    const news = await db.newsItem.findMany({ where: { subject: "person", subjectId: PERSON } });
    expect(news).toMatchObject([
      { mediaType: "movie", tmdbId: 2, title: "Heist", kind: "announced", headline: "New from Joel Edgerton", detail: "Heist announced", key: `person:${PERSON}:movie-2:announced` },
    ]);
  });
});

describe("A first look seeds news (Round 9)", () => {
  const soon = addDays(today, 20);
  const later = addDays(today, 200);
  const lastWeek = addDays(today, -7);
  const twoWeeks = addDays(today, -14);
  const titles = { "movie-1": "Soon", "tv-2": "Later", "movie-3": "Undated", "movie-4": "Last Week", "movie-5": "Two Weeks", "movie-6": "Old" };
  const credits = { "movie-6": "2011-01-01", "movie-5": twoWeeks, "movie-3": "", "tv-2": later, "movie-4": lastWeek, "movie-1": soon };

  it("seeds upcoming (soonest first, undated last) then recent (newest first), and nothing old", () => {
    expect(seedNews(credits, titles, today).map((n) => `${n.title}:${n.kind}`)).toEqual([
      "Soon:announced",
      "Later:announced",
      "Undated:announced",
      "Last Week:released",
      "Two Weeks:released",
    ]);
  });

  it("caps the seed at twelve, upcoming kept before recent", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 10; i++) many[`movie-${100 + i}`] = addDays(today, 10 + i);
    for (let i = 0; i < 10; i++) many[`movie-${200 + i}`] = addDays(today, -1 - i);
    const seeded = seedNews(many, {}, today);
    expect(seeded).toHaveLength(SEED_CAP);
    expect(seeded.filter((n) => n.kind === "announced")).toHaveLength(10);
    expect(seeded.slice(10).map((n) => n.tmdbId)).toEqual([200, 201]);
  });

  it("shows news the moment someone is followed, dated at the follow, and a second look adds nothing", async () => {
    await cachePerson(person([part(1, "Soon", soon), part(4, "Last Week", lastWeek), part(6, "Old", "2011-01-01")]));
    await followPerson(PERSON, true);
    const follow = await db.followedPerson.findUniqueOrThrow({ where: { userId_personId: { userId, personId: PERSON } } });
    const rows = await newsFor(userId);
    expect(rows.map((r) => r.detail)).toEqual(["Soon announced", "Last Week is out"]);
    for (const r of rows) expect(new Date(r.at).getTime()).toBeGreaterThanOrEqual(follow.followedAt.getTime());

    const details = person([part(1, "Soon", soon), part(4, "Last Week", lastWeek), part(6, "Old", "2011-01-01")]);
    expect(await recordPersonNews(PERSON, details, today)).toEqual([]);
    expect(await db.newsItem.count({ where: { subject: "person", subjectId: PERSON } })).toBe(2);
  });

  it("seeds, once, someone followed before seeding whose line was drawn silently", async () => {
    // The owner's case: followed, looked at, no news.
    await db.person.create({
      data: { tmdbId: PERSON, name: "Joel Edgerton", credits: JSON.stringify({ "movie-1": soon }), creditsCheckedAt: new Date() },
    });
    await db.followedPerson.create({ data: { userId, personId: PERSON } });
    expect(await unseededPersonIds()).toEqual([PERSON]);

    const stub = stubTmdb({ [`/person/${PERSON}`]: person([part(1, "Soon", soon)]) });
    try {
      expect((await checkFollowedPeople(today)).news).toBe(1);
      await queue.idle();
      expect(await unseededPersonIds()).toEqual([]);
      expect((await newsFor(userId)).map((r) => r.detail)).toEqual(["Soon announced"]);
      // The next pass is an ordinary look: nothing new, nothing again.
      expect((await checkFollowedPeople(today)).news).toBe(0);
    } finally {
      await queue.idle();
      stub.restore();
    }
  });
});
