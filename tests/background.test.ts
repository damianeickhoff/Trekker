import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dailyPoster } from "@/lib/background-art";
import {
  BACKGROUND_ART_KEY,
  BACKGROUND_COOKIE,
  BACKGROUND_HUES,
  backgroundCookieValue,
  backgroundFromRow,
  dailyIndex,
  isPosterPath,
  parseBackground,
} from "@/lib/background";
import { BOOT_SCRIPT } from "@/lib/boot-script";
import { db } from "@/lib/db";
import { setBackground } from "@/lib/settings";
import { appearanceLine, themeLine } from "@/components/settings/summaries";
import { freshUser } from "./helpers/db";

/*
 * T1, background variants: the choice as a cookie and a row, the daily
 * poster, and the boot script that puts it on <html> before first paint.
 */

describe("the background cookie", () => {
  it("reads back what the app writes", () => {
    for (const b of [
      { variant: "plain" as const, hue: 210 },
      { variant: "gradient" as const, hue: 210 },
      { variant: "artwork" as const, hue: 210 },
      { variant: "colour" as const, hue: 320 },
    ]) {
      expect(parseBackground(backgroundCookieValue(b))).toEqual(b);
    }
    expect(backgroundCookieValue({ variant: "colour", hue: 150 })).toBe("colour-150");
    expect(parseBackground(" Gradient ").variant).toBe("gradient");
  });

  it("refuses junk as plain: unknown words, hues that are not swatches, anything injected", () => {
    for (const junk of [undefined, null, "", "violet", "colour", "colour-", "colour-211", "colour-9999", "colour-210;x", "artwork\"", "url(x)"]) {
      expect(parseBackground(junk)).toEqual({ variant: "plain", hue: BACKGROUND_HUES[0] });
    }
  });

  it("reads the row the same way, null being plain", () => {
    expect(backgroundFromRow(null, null)).toEqual({ variant: "plain", hue: 210 });
    expect(backgroundFromRow("artwork", 355)).toEqual({ variant: "artwork", hue: 355 });
    expect(backgroundFromRow("sparkles", 7)).toEqual({ variant: "plain", hue: 210 });
  });

  it("keeps a hue near the accent out of the swatches", () => {
    expect(BACKGROUND_HUES).toHaveLength(8);
    for (const h of BACKGROUND_HUES) expect(h < 35 || h > 55).toBe(true);
  });
});

describe("the daily poster", () => {
  it("picks the same index all day and spreads across days", () => {
    const day = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;
    expect(dailyIndex("u1", day(24), 40)).toBe(dailyIndex("u1", day(24), 40));
    const picks = new Set(Array.from({ length: 14 }, (_, i) => dailyIndex("u1", day(i + 1), 40)));
    expect(picks.size).toBeGreaterThan(5);
    expect(dailyIndex("u1", day(1), 0)).toBe(-1);
    // Another person's day is another pick, most of the time.
    const others = Array.from({ length: 14 }, (_, i) => dailyIndex("u2", day(i + 1), 40) !== dailyIndex("u1", day(i + 1), 40));
    expect(others.filter(Boolean).length).toBeGreaterThan(7);
  });

  it("comes from the person's own last year of plays, stable within a day and changing across days", async () => {
    const user = await freshUser();
    const other = await freshUser();
    const recent = new Date("2026-09-01T20:00:00Z");
    await db.play.createMany({
      data: [
        ...Array.from({ length: 12 }, (_, i) => ({
          userId: user.id,
          mediaType: "movie",
          tmdbId: 100 + i,
          title: `Film ${i}`,
          poster: `/film${i}.jpg`,
          watchedAt: recent,
        })),
        // Two viewings of one title count once.
        { userId: user.id, mediaType: "movie", tmdbId: 100, title: "Film 0", poster: "/film0.jpg", watchedAt: new Date("2026-08-01T20:00:00Z") },
        // Too old, no poster, or not theirs: never picked.
        { userId: user.id, mediaType: "movie", tmdbId: 900, title: "Old", poster: "/old.jpg", watchedAt: new Date("2024-01-01T20:00:00Z") },
        { userId: user.id, mediaType: "tv", tmdbId: 901, title: "Bare", poster: null, watchedAt: recent },
        { userId: other.id, mediaType: "movie", tmdbId: 902, title: "Theirs", poster: "/theirs.jpg", watchedAt: recent },
      ],
    });

    const today = await dailyPoster(user.id, "2026-09-24");
    expect(today).toMatch(/^\/film\d+\.jpg$/);
    expect(await dailyPoster(user.id, "2026-09-24")).toBe(today);

    const fortnight = await Promise.all(Array.from({ length: 14 }, (_, i) => dailyPoster(user.id, `2026-09-${String(i + 10).padStart(2, "0")}`)));
    expect(new Set(fortnight).size).toBeGreaterThan(3);
    for (const p of fortnight) expect(p).toMatch(/^\/film\d+\.jpg$/);

    expect(await dailyPoster((await freshUser()).id, "2026-09-24")).toBeNull();
  });

  it("only lets a TMDB-shaped path into a CSS url()", () => {
    expect(isPosterPath("/ztadKzIIR0ERYqpHteaPFtk7inP.jpg")).toBe(true);
    for (const bad of ["ztad.jpg", "/a.jpg\")", "/../x.jpg", "/a b.jpg", "/a.svg", null, 7]) expect(isPosterPath(bad)).toBe(false);
  });
});

describe("saving the background", () => {
  it("writes the variant and the hue, plain as null, and refuses what is not offered", async () => {
    const user = await freshUser();
    expect(await setBackground(user.id, "colour", 280)).toEqual({ variant: "colour", hue: 280 });
    expect(await setBackground(user.id, "plain", 280)).toEqual({ variant: "plain", hue: 280 });
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { background: true, backgroundHue: true } });
    expect(row).toEqual({ background: null, backgroundHue: 280 });
    await expect(setBackground(user.id, "sparkles", 280)).rejects.toThrow();
    await expect(setBackground(user.id, "colour", 211)).rejects.toThrow();
  });
});

describe("the boot script's background", () => {
  function run(cookie: string, storage: Record<string, string> = {}) {
    const dataset: Record<string, string> = {};
    const style: Record<string, string> = {};
    const document = {
      cookie,
      documentElement: { dataset, style: { setProperty: (k: string, v: string) => (style[k] = v) } },
    };
    const matchMedia = () => ({ matches: false });
    const localStorage = { getItem: (k: string) => storage[k] ?? null };
    new Function("document", "matchMedia", "localStorage", BOOT_SCRIPT)(document, matchMedia, localStorage);
    return { dataset, style };
  }

  it("sets data-background from the cookie before paint, as the server reads it", () => {
    expect(run(`${BACKGROUND_COOKIE}=gradient`).dataset.background).toBe("gradient");
    expect(run(`trekker_theme=light; ${BACKGROUND_COOKIE}=artwork`).dataset).toEqual({ theme: "light", background: "artwork" });
    const colour = run(`${BACKGROUND_COOKIE}=colour-320`);
    expect(colour.dataset.background).toBe("colour");
    expect(colour.style["--bg-hue"]).toBe("320");
  });

  it("leaves junk and plain as no attribute at all", () => {
    for (const junk of ["", `${BACKGROUND_COOKIE}=plain`, `${BACKGROUND_COOKIE}=colour-211`, `${BACKGROUND_COOKIE}=sparkles`]) {
      expect(run(junk).dataset.background).toBeUndefined();
    }
  });

  it("paints the artwork this browser last drew, and only a poster-shaped path", () => {
    const art = run(`${BACKGROUND_COOKIE}=artwork`, { [BACKGROUND_ART_KEY]: "/abc123.jpg" });
    expect(art.style["--bg-art"]).toBe('url("https://image.tmdb.org/t/p/w92/abc123.jpg")');
    expect(run(`${BACKGROUND_COOKIE}=artwork`, { [BACKGROUND_ART_KEY]: '/x.jpg");background:red;("' }).style["--bg-art"]).toBeUndefined();
    // Not the artwork: storage is not even read into the page.
    expect(run(`${BACKGROUND_COOKIE}=gradient`, { [BACKGROUND_ART_KEY]: "/abc123.jpg" }).style["--bg-art"]).toBeUndefined();
  });
});

describe("the Appearance summary", () => {
  const facts = { theme: "dark" as const, resolved: "dark" as const, screensaver: 10 };
  it("names the background beside the theme, and says nothing for plain", () => {
    expect(themeLine({ ...facts, background: "artwork" })).toBe("Dark · artwork background");
    expect(themeLine({ ...facts, background: "plain" })).toBe("Dark");
    expect(themeLine({ theme: "system", resolved: null, background: "colour" })).toBe("Follows the device · colour background");
  });

  it("keeps the desktop list's line as it was for plain", () => {
    const base = { ...facts, services: [], region: "", regionDefault: true, push: null, friends: true, challenges: true, news: false };
    expect(appearanceLine({ ...base, background: "plain" })).toBe("Dark · screensaver 10 min");
    expect(appearanceLine({ ...base, background: "gradient" })).toBe("Dark · gradient background · screensaver 10 min");
  });
});

describe("the background in CSS", () => {
  const css = readFileSync(path.resolve(import.meta.dirname, "../src/app/globals.css"), "utf8");
  it("tints the page colour itself for a colour, and draws the other two as a fixed layer under everything", () => {
    expect(css).toMatch(/:root\[data-background="colour"\] \{\s*--bg: color-mix\(in oklab, #0b0c10 90%, hsl\(var\(--bg-hue/);
    expect(css).toMatch(/::before \{\s*content: "";\s*position: fixed;\s*z-index: -1;\s*pointer-events: none;/);
    expect(css).toMatch(/:root\[data-background="artwork"\]::before \{[^}]*background: var\(--bg-art, none\)/);
  });
});
