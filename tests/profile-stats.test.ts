import { beforeEach, describe, expect, it } from "vitest";
import { getMostWatched } from "@/lib/profile";
import { getStats } from "@/lib/stats";
import { recordPlay } from "@/lib/plays";
import { resolveRange } from "@/lib/range";
import { at, episode, film, freshUser, hours, T0 } from "./helpers/db";

/**
 * The reads behind the profile page, which used to fold the entire play log in
 * memory to answer questions about a handful of titles — so an account that
 * rewatched a lot paid for its rewatches several times over on every render.
 *
 * The counting moved into SQL. These are here to hold the answers still while
 * it did, which is the only thing that could have gone wrong: a podium built
 * from aggregates and one built from a fold have no reason to agree unless
 * somebody checks.
 */

let userId: string;

beforeEach(async () => {
  userId = (await freshUser()).id;
});

/** Viewings spaced well clear of the duplicate window, so all of them land. */
async function watch(input: Record<string, unknown>, times: number, from = 0) {
  for (let i = 0; i < times; i += 1) {
    await recordPlay(userId, { ...input, watchedAt: at(hours(from + i * 24)) } as never);
  }
}

describe("getMostWatched", () => {
  it("ranks by viewings and counts every rewatch", async () => {
    await watch(film(), 3);
    await watch(film({ tmdbId: 27205, title: "Inception", runtime: 148 }), 1, 500);

    const podium = await getMostWatched(userId, 5);

    expect(podium.map((row) => [row.title, row.plays])).toEqual([
      ["Fight Club", 3],
      ["Inception", 1],
    ]);
    expect(podium[0].minutes).toBe(139 * 3);
    expect(podium[0].mediaType).toBe("movie");
  });

  it("counts a show's episodes together, under the show", async () => {
    await watch(episode(1), 1);
    await watch(episode(2), 1, 5);
    await watch(episode(3), 1, 10);
    await watch(film(), 2, 100);

    const podium = await getMostWatched(userId, 5);

    // Three episodes beats two viewings of one film — the whole point of the
    // list being mixed rather than split by medium.
    expect(podium[0].title).toBe("Breaking Bad");
    expect(podium[0].plays).toBe(3);
    expect(podium[0].mediaType).toBe("tv");
  });

  it("breaks a tie on minutes, and honours the limit", async () => {
    await watch(film(), 2);
    await watch(film({ tmdbId: 27205, title: "Inception", runtime: 148 }), 2, 500);

    const podium = await getMostWatched(userId, 1);

    expect(podium).toHaveLength(1);
    // Equal viewings, so the longer film wins.
    expect(podium[0].title).toBe("Inception");
  });

  it("takes the poster from the newest play that has one", async () => {
    await recordPlay(userId, { ...film({ poster: "/old.jpg" }), watchedAt: T0 });
    await recordPlay(userId, { ...film({ poster: null }), watchedAt: at(hours(50)) });

    const [top] = await getMostWatched(userId, 5);

    expect(top.plays).toBe(2);
    expect(top.poster).toBe("/old.jpg");
  });

  it("has nothing to say about an account with no plays", async () => {
    expect(await getMostWatched(userId, 5)).toEqual([]);
  });
});

describe("getStats — distinct titles", () => {
  it("separates viewings from titles, filtered and unfiltered alike", async () => {
    await watch(film(), 3);
    await watch(film({ tmdbId: 27205, title: "Inception", runtime: 148 }), 1, 500);
    await watch(episode(1), 2);

    const all = await getStats(userId, resolveRange("all"));

    // Four film viewings of two different films — the distinction the panel
    // draws, and the one the rewatch-heavy accounts made expensive.
    expect(all.movieCount).toBe(4);
    expect(all.distinctMovies).toBe(2);
    expect(all.showCount).toBe(1);
    expect(all.episodeCount).toBe(2);

    // A bounded window answers off the play log instead. Built by hand rather
    // than from a key, so the fixture's fixed instant cannot fall out of the
    // window as the calendar moves on.
    const window = {
      ...resolveRange("all"),
      from: at(-hours(24)),
      to: at(hours(1000)),
    };
    const bounded = await getStats(userId, window);

    expect(bounded.distinctMovies).toBe(all.distinctMovies);
    expect(bounded.showCount).toBe(all.showCount);
    expect(bounded.movieCount).toBe(all.movieCount);
  });
});
