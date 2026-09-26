import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordPlay } from "@/lib/plays";
import { episode, freshUser, T0 } from "./helpers/db";

/**
 * Home's cached rails are keyed on the play count, so a play logged where no
 * tag can be expired (the Plex history sync) is read on the next render rather
 * than after a stale entry has been served once more.
 */

const keys: string[][] = [];

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, key: string[]) => {
    keys.push(key);
    return fn;
  },
}));

const { cachedRecentlyWatched } = await import("@/lib/home-cache");

let userId: string;

beforeEach(async () => {
  keys.length = 0;
  userId = (await freshUser()).id;
});

describe("Home's cached rails", () => {
  it("move to a new key when a play is logged outside a request", async () => {
    await cachedRecentlyWatched(userId);
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0, source: "plex", sourceRef: "history-1" });
    const recent = await cachedRecentlyWatched(userId);
    expect(keys[0]).not.toEqual(keys[1]);
    expect(recent.map((r) => r.episodeNumber)).toEqual([1]);
  });
});
