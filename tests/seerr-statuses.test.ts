import { afterEach, describe, expect, it, vi } from "vitest";
import { getSeerrStatuses } from "@/lib/seerr";

/**
 * The sweep behind the poster marks.
 *
 * It used to be one call for the first five hundred rows, which is not the same
 * thing as "every title Overseerr knows about": the media list holds a row for
 * the whole Plex library, so on a real instance the mark quietly stopped
 * appearing on everything older than the last few hundred additions — and a
 * body that size was slow enough to trip the timeout and take the rest with it.
 * Both halves of that are what these pin down.
 */

const CONNECTION = { url: "http://seerr.test", apiKey: "key" };

/** Overseerr's media list, sliced the way the real endpoint slices it. */
function instance(rows: { tmdbId: number; mediaType: string; status: number }[]) {
  return vi.fn(async (url: string | URL) => {
    const query = new URL(String(url)).searchParams;
    const take = Number(query.get("take"));
    const skip = Number(query.get("skip"));

    return new Response(
      JSON.stringify({
        pageInfo: { pages: Math.ceil(rows.length / take), results: rows.length },
        results: rows.slice(skip, skip + take),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
}

function library(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    tmdbId: index + 1,
    mediaType: "movie",
    // 5 is AVAILABLE — what most of a scanned library reads as.
    status: 5,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSeerrStatuses", () => {
  it("keeps going past the first page", async () => {
    vi.stubGlobal("fetch", instance(library(900)));

    const statuses = await getSeerrStatuses(CONNECTION);

    expect(statuses.size).toBe(900);
    // The last row is the oldest one — the far end of the list, which is
    // exactly what a single first page could never reach.
    expect(statuses.get("movie-900")?.kind).toBe("available");
  });

  it("asks for a page at a time rather than the lot", async () => {
    const seerr = instance(library(900));
    vi.stubGlobal("fetch", seerr);

    await getSeerrStatuses(CONNECTION);

    expect(seerr.mock.calls.length).toBeGreaterThan(1);
    for (const [url] of seerr.mock.calls) {
      expect(Number(new URL(String(url)).searchParams.get("take"))).toBeLessThanOrEqual(200);
    }
  });

  it("keeps the pages that answered when one does not", async () => {
    const rows = library(600);
    const seerr = instance(rows);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        // The second page times out; the first and third are fine.
        if (new URL(String(url)).searchParams.get("skip") === "200") throw new Error("timeout");
        return seerr(url);
      }),
    );

    const statuses = await getSeerrStatuses(CONNECTION);

    expect(statuses.has("movie-1")).toBe(true);
    expect(statuses.has("movie-600")).toBe(true);
    // Only the missing page's worth is missing.
    expect(statuses.size).toBe(400);
  });

  it("says nothing at all when the instance will not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    expect((await getSeerrStatuses(CONNECTION)).size).toBe(0);
  });

  it("drops titles nobody has asked for, since absence is the news", async () => {
    vi.stubGlobal(
      "fetch",
      instance([
        { tmdbId: 1, mediaType: "movie", status: 1 },
        { tmdbId: 2, mediaType: "tv", status: 2 },
        { tmdbId: 3, mediaType: "tv", status: 4 },
      ]),
    );

    const statuses = await getSeerrStatuses(CONNECTION);

    expect(statuses.has("movie-1")).toBe(false);
    expect(statuses.get("tv-2")?.kind).toBe("pending");
    expect(statuses.get("tv-3")?.kind).toBe("partial");
  });
});
