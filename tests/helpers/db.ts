import { db } from "@/lib/db";

/**
 * Fixtures shared by the database-backed tests.
 *
 * Deliberately thin: a user to own the rows, and shorthands for the two
 * identities `plays.ts` works in. Anything cleverer here tends to end up
 * asserting the fixture rather than the code.
 */

let seq = 0;

/** A throwaway account. Unique per call, since email is unique. */
export async function freshUser() {
  seq += 1;
  return db.user.create({
    data: {
      email: `test-${seq}-${Date.now()}@example.com`,
      name: `Tester ${seq}`,
      passwordHash: "not-a-real-hash",
    },
  });
}

/** Minutes as milliseconds, for readable duplicate-window arithmetic. */
export function minutes(n: number) {
  return n * 60 * 1000;
}

export function hours(n: number) {
  return n * 60 * 60 * 1000;
}

/** A fixed instant, so a test never straddles midnight or a DST boundary. */
export const T0 = new Date("2026-05-10T20:00:00.000Z");

export function at(offsetMs: number) {
  return new Date(T0.getTime() + offsetMs);
}

/** The film every movie test logs, unless it needs two. */
export function film(overrides: Record<string, unknown> = {}) {
  return {
    mediaType: "movie" as const,
    tmdbId: 550,
    title: "Fight Club",
    poster: "/poster.jpg",
    runtime: 139,
    ...overrides,
  };
}

/** One episode of one show. */
export function episode(number = 1, overrides: Record<string, unknown> = {}) {
  return {
    mediaType: "tv" as const,
    tmdbId: 1396,
    title: "Breaking Bad",
    poster: "/bb.jpg",
    seasonNumber: 1,
    episodeNumber: number,
    episodeName: `Episode ${number}`,
    runtime: 47,
    ...overrides,
  };
}

/** How many plays exist for one identity — the thing most assertions want. */
export function countPlays(userId: string, where: Record<string, unknown>) {
  return db.play.count({ where: { userId, ...where } });
}
