import { db } from "@/lib/db";

let seq = 0;

/** A throwaway account. Unique per call, since email is unique. */
export async function freshUser() {
  seq += 1;
  return db.user.create({
    data: { email: `test-${seq}-${Date.now()}@example.com`, name: `Tester ${seq}`, passwordHash: "x" },
  });
}

export const minutes = (n: number) => n * 60 * 1000;
export const hours = (n: number) => n * 60 * 60 * 1000;

/** A fixed instant, so no test straddles midnight or a clock change. */
export const T0 = new Date("2026-05-10T20:00:00.000Z");
export const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

export function film(overrides: Record<string, unknown> = {}) {
  return { mediaType: "movie" as const, tmdbId: 550, title: "Fight Club", poster: "/fc.jpg", runtime: 139, ...overrides };
}

export function episode(season: number, number: number, overrides: Record<string, unknown> = {}) {
  return {
    mediaType: "tv" as const,
    tmdbId: 1396,
    title: "Breaking Bad",
    poster: "/bb.jpg",
    seasonNumber: season,
    episodeNumber: number,
    episodeName: `Episode ${number}`,
    runtime: 47,
    ...overrides,
  };
}

/**
 * A show's episode list, as the refresh job would have stored it: `aired`
 * episodes in the past, the rest in the future.
 */
export async function seedEpisodes(showId: number, seasons: { season: number; count: number; airedFrom: string }[]) {
  const rows = seasons.flatMap(({ season, count, airedFrom }) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(`${airedFrom}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i * 7);
      return {
        showId,
        seasonNumber: season,
        episodeNumber: i + 1,
        name: `S${season}E${i + 1}`,
        airDate: d.toISOString().slice(0, 10),
        runtime: 45,
      };
    }),
  );
  await db.showEpisode.createMany({ data: rows });
}
