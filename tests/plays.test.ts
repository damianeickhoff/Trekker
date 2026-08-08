import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  clearShow,
  deletePlays,
  recordEpisodeRewatches,
  recordNewEpisodePlays,
  recordPlay,
  setPlayDate,
} from "@/lib/plays";
import { at, episode, film, freshUser, hours, minutes, T0 } from "./helpers/db";

/**
 * `plays.ts` is the only writer of the play log and of the two watched tables
 * that index it, which makes it the module where a mistake is least
 * recoverable — a lost play cannot be reconstructed from anywhere else.
 *
 * The cases below are organised by the four guards `recordPlay` runs in order,
 * because every duplicate-viewing bug this app has had was one of them not
 * firing when it should, or firing when it should not.
 */

let userId: string;

beforeEach(async () => {
  userId = (await freshUser()).id;
});

/* ========================================================================== */

describe("recordPlay — guard 1: the source's own id", () => {
  it("logs a first viewing and builds the watched row", async () => {
    const result = await recordPlay(userId, { ...film(), watchedAt: T0 });

    expect(result.created).toBe(true);
    expect(result.isRewatch).toBe(false);
    expect(result.plays).toBe(1);

    const watched = await db.watchedMovie.findFirst({ where: { userId } });
    expect(watched?.plays).toBe(1);
    expect(watched?.watchedAt).toEqual(T0);
  });

  it("ignores the same source id reported twice", async () => {
    const input = { ...film(), watchedAt: T0, source: "plex" as const, sourceRef: "abc:1" };

    await recordPlay(userId, input);
    // Far outside the duplicate window, so only the id can be suppressing it.
    const again = await recordPlay(userId, { ...input, watchedAt: at(hours(200)) });

    expect(again.created).toBe(false);
    expect(again.plays).toBe(1);
    expect(await db.play.count({ where: { userId } })).toBe(1);
  });

  it("treats the same ref under a different source as a different viewing", async () => {
    // The unique index is (userId, source, sourceRef), so this is by design:
    // Plex's ratingKey and Trakt's id occupy separate namespaces.
    await recordPlay(userId, {
      ...film(),
      watchedAt: T0,
      source: "plex",
      sourceRef: "shared-id",
    });
    const other = await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(200)),
      source: "trakt",
      sourceRef: "shared-id",
    });

    expect(other.created).toBe(true);
    expect(other.plays).toBe(2);
  });
});

/* ========================================================================== */

describe("recordPlay — guard 2: the gravestone", () => {
  it("does not resurrect a viewing the user deleted", async () => {
    const input = { ...film(), watchedAt: T0, source: "plex" as const, sourceRef: "gone:1" };

    await recordPlay(userId, input);
    await deletePlays(userId, { mediaType: "movie", tmdbId: 550 }, "all");

    // This is the sync running again ten minutes later.
    const resurrected = await recordPlay(userId, input);

    expect(resurrected.created).toBe(false);
    expect(await db.play.count({ where: { userId } })).toBe(0);
    expect(await db.watchedMovie.count({ where: { userId } })).toBe(0);
  });

  it("still accepts a genuinely new viewing of the same title", async () => {
    // Why the gravestone can be permanent: watching it again on Plex writes a
    // new history row with a new timestamp, hence a ref that is not buried.
    await recordPlay(userId, {
      ...film(),
      watchedAt: T0,
      source: "plex",
      sourceRef: "gone:1",
    });
    await deletePlays(userId, { mediaType: "movie", tmdbId: 550 }, "all");

    const fresh = await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(48)),
      source: "plex",
      sourceRef: "later:2",
    });

    expect(fresh.created).toBe(true);
    expect(fresh.plays).toBe(1);
  });

  it("buries only the rows that carried an id", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(48)),
      source: "plex",
      sourceRef: "keep:1",
    });

    await deletePlays(userId, { mediaType: "movie", tmdbId: 550 }, "all");

    // Nothing could ever resurrect a ref-less play, so nothing is remembered.
    const graves = await db.deletedPlay.findMany({ where: { userId } });
    expect(graves).toHaveLength(1);
    expect(graves[0].sourceRef).toBe("keep:1");
  });
});

/* ========================================================================== */

describe("recordPlay — guard 3: adoption", () => {
  it("claims an unsourced import rather than counting it twice", async () => {
    // This is the bug the play-log backfill migration caused: it gave every
    // existing watched row a ref-less play, so the next sync re-imported
    // viewings it had already seen and called them rewatches.
    await recordPlay(userId, { ...film(), watchedAt: T0, source: "backfill" });

    const plexDate = at(hours(300));
    const adopted = await recordPlay(userId, {
      ...film(),
      watchedAt: plexDate,
      source: "plex",
      sourceRef: "1607:99",
    });

    expect(adopted.created).toBe(false);
    expect(adopted.plays).toBe(1);

    const play = await db.play.findFirstOrThrow({ where: { userId } });
    expect(play.source).toBe("plex");
    expect(play.sourceRef).toBe("1607:99");
    // The Plex timestamp wins: a backfilled date is only ever a copy of
    // whatever the watched row happened to say.
    expect(play.watchedAt).toEqual(plexDate);
  });

  it("leaves a manual tick alone", async () => {
    // A tick in Trekker is the user's own assertion, made at a time they
    // chose. Reinterpreting it as a Plex session weeks earlier is not this
    // code's call — so this becomes a second play, not an adoption.
    await recordPlay(userId, { ...film(), watchedAt: T0, source: "manual" });

    const second = await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(300)),
      source: "plex",
      sourceRef: "1607:99",
    });

    expect(second.created).toBe(true);
    expect(second.plays).toBe(2);
  });

  it("adopts at most one row per report", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0, source: "backfill" });
    await recordPlay(userId, { ...film(), watchedAt: at(hours(100)), source: "backfill" });

    await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(300)),
      source: "plex",
      sourceRef: "a:1",
    });
    await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(400)),
      source: "plex",
      sourceRef: "b:2",
    });
    // Both ref-less rows are spoken for; a third report is a real third play.
    const third = await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(500)),
      source: "plex",
      sourceRef: "c:3",
    });

    expect(third.created).toBe(true);
    expect(third.plays).toBe(3);
  });

  it("takes the oldest unsourced row first", async () => {
    await recordPlay(userId, { ...film(), watchedAt: at(hours(100)), source: "backfill" });
    await recordPlay(userId, { ...film(), watchedAt: T0, source: "backfill" });

    await recordPlay(userId, {
      ...film(),
      watchedAt: at(hours(300)),
      source: "plex",
      sourceRef: "a:1",
    });

    const untouched = await db.play.findFirstOrThrow({ where: { userId, sourceRef: null } });
    expect(untouched.watchedAt).toEqual(at(hours(100)));
  });
});

/* ========================================================================== */

describe("recordPlay — guard 4: the duplicate window", () => {
  it("collapses two reports of one film inside four hours", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    const near = await recordPlay(userId, { ...film(), watchedAt: at(hours(3)) });

    expect(near.created).toBe(false);
    expect(near.plays).toBe(1);
  });

  it("counts two viewings of one film outside four hours", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    const later = await recordPlay(userId, { ...film(), watchedAt: at(hours(5)) });

    expect(later.created).toBe(true);
    expect(later.plays).toBe(2);
    expect(later.isRewatch).toBe(true);
  });

  it("uses a tighter window for episodes", async () => {
    await recordPlay(userId, { ...episode(1), watchedAt: T0 });

    const near = await recordPlay(userId, { ...episode(1), watchedAt: at(minutes(20)) });
    expect(near.created).toBe(false);

    const far = await recordPlay(userId, { ...episode(1), watchedAt: at(minutes(40)) });
    expect(far.created).toBe(true);
    expect(far.plays).toBe(2);
  });

  it("does not let a marathon of different episodes collapse", async () => {
    await recordPlay(userId, { ...episode(1), watchedAt: T0 });
    const next = await recordPlay(userId, { ...episode(2), watchedAt: at(minutes(5)) });

    expect(next.created).toBe(true);
    expect(next.plays).toBe(1);
  });

  it("suppresses a never-seen id inside the window", async () => {
    // Plex writes two history rows for one viewing that was paused and
    // resumed — distinct ids, one evening. The window is what catches those.
    await recordPlay(userId, {
      ...episode(1),
      watchedAt: T0,
      source: "plex",
      sourceRef: "x:1",
    });
    const resumed = await recordPlay(userId, {
      ...episode(1),
      watchedAt: at(minutes(10)),
      source: "plex",
      sourceRef: "x:2",
    });

    expect(resumed.created).toBe(false);
    expect(resumed.plays).toBe(1);
  });

  it("keeps a film and a show sharing a tmdb id apart", async () => {
    await recordPlay(userId, { ...film({ tmdbId: 1396 }), watchedAt: T0 });
    const show = await recordPlay(userId, { ...episode(1), watchedAt: T0 });

    expect(show.created).toBe(true);
    expect(show.plays).toBe(1);
    expect(await db.watchedMovie.count({ where: { userId } })).toBe(1);
    expect(await db.watchedEpisode.count({ where: { userId } })).toBe(1);
  });
});

/* ========================================================================== */

describe("the watched row is derived, never incremented", () => {
  it("takes first and last from the log whatever order they arrive in", async () => {
    await recordPlay(userId, { ...film(), watchedAt: at(hours(100)) });
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, { ...film(), watchedAt: at(hours(50)) });

    const watched = await db.watchedMovie.findFirstOrThrow({ where: { userId } });
    expect(watched.plays).toBe(3);
    expect(watched.watchedAt).toEqual(T0);
    expect(watched.lastWatchedAt).toEqual(at(hours(100)));
  });

  it("does not let a thinner later report blank what is already known", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, {
      ...film({ poster: null, runtime: 0 }),
      watchedAt: at(hours(50)),
    });

    const watched = await db.watchedMovie.findFirstOrThrow({ where: { userId } });
    expect(watched.poster).toBe("/poster.jpg");
    expect(watched.runtime).toBe(139);
  });
});

/* ========================================================================== */

describe("deletePlays", () => {
  it('"last" removes only the newest and reports the date now standing', async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, { ...film(), watchedAt: at(hours(50)) });

    const after = await deletePlays(userId, { mediaType: "movie", tmdbId: 550 }, "last");

    expect(after.remaining).toBe(1);
    expect(after.lastWatchedAt).toEqual(T0);
    expect(await db.watchedMovie.count({ where: { userId } })).toBe(1);
  });

  it('"all" takes the watched row with it', async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, { ...film(), watchedAt: at(hours(50)) });

    const after = await deletePlays(userId, { mediaType: "movie", tmdbId: 550 }, "all");

    expect(after.remaining).toBe(0);
    expect(after.lastWatchedAt).toBeNull();
    expect(await db.watchedMovie.count({ where: { userId } })).toBe(0);
  });
});

/* ========================================================================== */

describe("clearShow", () => {
  it("clears one season and leaves the others standing", async () => {
    await recordPlay(userId, { ...episode(1), watchedAt: T0 });
    await recordPlay(userId, {
      ...episode(1, { seasonNumber: 2 }),
      watchedAt: at(hours(50)),
    });

    await clearShow(userId, 1396, 1);

    const left = await db.watchedEpisode.findMany({ where: { userId } });
    expect(left).toHaveLength(1);
    expect(left[0].seasonNumber).toBe(2);
  });

  it("clears the whole show when no season is named", async () => {
    await recordPlay(userId, { ...episode(1), watchedAt: T0 });
    await recordPlay(userId, {
      ...episode(1, { seasonNumber: 2 }),
      watchedAt: at(hours(50)),
    });

    await clearShow(userId, 1396);

    expect(await db.watchedEpisode.count({ where: { userId } })).toBe(0);
    expect(await db.play.count({ where: { userId } })).toBe(0);
  });
});

/* ========================================================================== */

describe("setPlayDate", () => {
  it("moves the newest viewing and leaves the older one alone", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, { ...film(), watchedAt: at(hours(50)) });

    // Corrected to *before* the older one, which makes that older one latest.
    const moved = await setPlayDate(
      userId,
      { mediaType: "movie", tmdbId: 550 },
      at(-hours(50)),
    );

    expect(moved.ok).toBe(true);
    expect(moved.lastWatchedAt).toEqual(T0);
  });

  it("repairs a watched row that has no play behind it", async () => {
    await db.watchedMovie.create({
      data: { userId, movieId: 550, title: "Fight Club", runtime: 139, watchedAt: T0 },
    });

    const repaired = await setPlayDate(userId, { mediaType: "movie", tmdbId: 550 }, T0);

    expect(repaired.ok).toBe(true);
    const play = await db.play.findFirstOrThrow({ where: { userId } });
    expect(play.source).toBe("backfill");
  });
});

/* ========================================================================== */

describe("the bulk writers", () => {
  it("writes past the SQLite variable cap", async () => {
    // Chunked at 200 internally; 450 proves the loop rather than the first
    // statement. A long-running show is genuinely this size.
    const rows = Array.from({ length: 450 }, (_, i) => ({
      showId: 1396,
      showName: "Breaking Bad",
      seasonNumber: 1 + Math.floor(i / 25),
      episodeNumber: (i % 25) + 1,
      episodeName: `Episode ${i}`,
      runtime: 47,
      watchedAt: T0,
    }));

    expect(await recordNewEpisodePlays(userId, rows)).toBe(450);
    expect(await db.watchedEpisode.count({ where: { userId } })).toBe(450);
    expect(await db.play.count({ where: { userId } })).toBe(450);
  });

  it("adds a viewing to episodes already on record and creates the rest", async () => {
    await recordPlay(userId, { ...episode(1), watchedAt: T0 });

    const written = await recordEpisodeRewatches(
      userId,
      [1, 2].map((n) => ({
        showId: 1396,
        showName: "Breaking Bad",
        seasonNumber: 1,
        episodeNumber: n,
        episodeName: `Episode ${n}`,
        runtime: 47,
      })),
      at(hours(300)),
    );

    expect(written).toBe(2);

    const first = await db.watchedEpisode.findFirstOrThrow({
      where: { userId, episodeNumber: 1 },
    });
    expect(first.plays).toBe(2);
    // Discovery date survives a rewatch; only the last-watched date moves.
    expect(first.watchedAt).toEqual(T0);
    expect(first.lastWatchedAt).toEqual(at(hours(300)));

    const second = await db.watchedEpisode.findFirstOrThrow({
      where: { userId, episodeNumber: 2 },
    });
    expect(second.plays).toBe(1);
  });

  it("skips anything logged inside the duplicate window", async () => {
    // Marking a season watched and immediately watching it again must not
    // invent a viewing that did not happen.
    await recordPlay(userId, { ...episode(1), watchedAt: T0 });

    const written = await recordEpisodeRewatches(
      userId,
      [
        {
          showId: 1396,
          showName: "Breaking Bad",
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: "Episode 1",
          runtime: 47,
        },
      ],
      at(minutes(10)),
    );

    expect(written).toBe(0);
    expect(await db.play.count({ where: { userId } })).toBe(1);
  });
});
