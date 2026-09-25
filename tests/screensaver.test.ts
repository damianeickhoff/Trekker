import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createIdleTimer } from "@/lib/idle-timer";
import { safeReturn, screensaverSlides } from "@/lib/screensaver";
import { cacheKey, movieDetailsKey } from "@/lib/tmdb";
import { forgetWeather, unitFor, WEATHER_LIFETIME_MS, weatherAt, weatherLine } from "@/lib/weather";
import { freshUser } from "./helpers/db";

/**
 * The screensaver's three moving parts that can be pinned without a browser:
 * the idle timer that starts it, the hour the weather is kept, and where the
 * pictures come from.
 */

describe("the idle timer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const MINUTE = 60_000;

  it("starts after the delay with nothing happening, and only once", () => {
    const idle = vi.fn();
    createIdleTimer(10 * MINUTE, idle);
    vi.advanceTimersByTime(10 * MINUTE - 1);
    expect(idle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(idle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * MINUTE);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("waits the full delay again from the last input, without a timer per input", () => {
    const idle = vi.fn();
    const timer = createIdleTimer(5 * MINUTE, idle);
    vi.advanceTimersByTime(4 * MINUTE);
    for (let i = 0; i < 500; i += 1) timer.activity();
    // Input writes a time down and arms nothing.
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(4 * MINUTE);
    expect(idle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MINUTE);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("is cancelled by stop, and a veto starts the wait over", () => {
    const stopped = vi.fn();
    createIdleTimer(MINUTE, stopped).stop();
    vi.advanceTimersByTime(10 * MINUTE);
    expect(stopped).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    let hidden = true;
    const vetoed = vi.fn();
    createIdleTimer(MINUTE, vetoed, { shouldFire: () => !hidden });
    vi.advanceTimersByTime(3 * MINUTE);
    expect(vetoed).not.toHaveBeenCalled();
    hidden = false;
    vi.advanceTimersByTime(MINUTE);
    expect(vetoed).toHaveBeenCalledTimes(1);
  });
});

describe("the weather", () => {
  beforeEach(() => forgetWeather());
  afterEach(() => {
    delete process.env.WEATHER_LATITUDE;
    delete process.env.WEATHER_LONGITUDE;
    delete process.env.WEATHER_PLACE;
  });

  const answer = (temperature: number, code = 0) =>
    vi.fn(async () => new Response(JSON.stringify({ current: { temperature_2m: temperature, weather_code: code } })));

  it("asks once an hour per place, and again once the hour is up", async () => {
    let now = Date.parse("2026-09-24T20:00:00Z");
    const fetcher = answer(14.4);
    const deps = { fetcher: fetcher as unknown as typeof fetch, now: () => now };

    expect(await weatherAt(52.09, 5.12, "C", deps)).toEqual({ temperature: 14, unit: "C", label: "clear" });
    now += WEATHER_LIFETIME_MS - 1;
    await weatherAt(52.09, 5.12, "C", deps);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Another unit is another question.
    await weatherAt(52.09, 5.12, "F", deps);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String((fetcher.mock.calls[1] as unknown[])[0])).toContain("temperature_unit=fahrenheit");

    now += 2;
    await weatherAt(52.09, 5.12, "C", deps);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps a failure only a few minutes, and never throws", async () => {
    let now = Date.parse("2026-09-24T20:00:00Z");
    const fetcher = vi.fn(async () => new Response("down", { status: 503 }));
    const deps = { fetcher: fetcher as unknown as typeof fetch, now: () => now };
    expect(await weatherAt(52.09, 5.12, "C", deps)).toBeNull();
    now += 60_000;
    await weatherAt(52.09, 5.12, "C", deps);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 5 * 60_000;
    await weatherAt(52.09, 5.12, "C", deps);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reads in the unit the region uses, at the instance's place, or not at all", async () => {
    expect(unitFor("US")).toBe("F");
    expect(unitFor("NL")).toBe("C");

    const fetcher = answer(14, 3);
    expect(await weatherLine("NL", { fetcher: fetcher as unknown as typeof fetch })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();

    process.env.WEATHER_LATITUDE = "52.09";
    process.env.WEATHER_LONGITUDE = "5.12";
    process.env.WEATHER_PLACE = "Utrecht";
    expect(await weatherLine("NL", { fetcher: fetcher as unknown as typeof fetch })).toBe("Utrecht 14° and overcast");
  });
});

describe("the pictures", () => {
  it("draws on history and the watchlist, only where a backdrop is already known", async () => {
    const user = await freshUser();
    await db.titleState.create({
      data: { userId: user.id, showId: 77, showName: "Lanterns", watchedCount: 3, backdrop: "/lanterns.jpg", lastWatchedAt: new Date() },
    });
    await db.watchlistItem.create({ data: { userId: user.id, mediaType: "movie", tmdbId: 603, title: "The Matrix", poster: "/m.jpg" } });
    await db.watchlistItem.create({ data: { userId: user.id, mediaType: "movie", tmdbId: 604, title: "Never opened" } });
    const k = movieDetailsKey(603);
    await db.tmdbCache.create({
      data: { key: cacheKey(k.path, k.params), body: JSON.stringify({ backdrop_path: "/matrix.jpg" }), expiresAt: new Date(Date.now() + 60_000) },
    });

    const slides = await screensaverSlides(user.id);
    expect(slides.map((s) => [s.title, s.backdrop])).toEqual([
      ["Lanterns", "/lanterns.jpg"],
      ["The Matrix", "/matrix.jpg"],
    ]);
  });

  it("wakes back to a page on this instance, and nowhere else", () => {
    expect(safeReturn("/lists?sort=az")).toBe("/lists?sort=az");
    expect(safeReturn("https://example.com")).toBe("/");
    expect(safeReturn("//example.com")).toBe("/");
    expect(safeReturn("/screensaver")).toBe("/");
    expect(safeReturn(undefined)).toBe("/");
  });
});
