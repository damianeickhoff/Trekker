/**
 * What stands behind every page: the page colour (plain, the default), a quiet
 * gradient of it, a blurred poster from the person's own history that changes
 * once a day, or a hue of their choosing mixed into it. STYLE.md, Theme.
 *
 * The shell paints before any data, so the choice has to be known at paint
 * time: it lives on `User` (`background`, `backgroundHue`) and is mirrored in
 * a cookie beside the theme's, which the root layout and the boot script read
 * and turn into `data-background` (and `--bg-hue`) on <html>. Everything here
 * is plain data and runs in the browser too; the daily poster's query is in
 * `background-art.ts`, on the server.
 */

export const BACKGROUND_COOKIE = "trekker_background";

/** The last daily poster this browser drew, so a launch paints it before the bell's answer. */
export const BACKGROUND_ART_KEY = "trekker:bg-art";

export const BACKGROUND_VARIANTS = ["plain", "gradient", "artwork", "colour"] as const;
export type BackgroundVariant = (typeof BACKGROUND_VARIANTS)[number];

/**
 * The eight swatches, as hues in degrees: blues, violets, pinks, a red, greens.
 * None near the amber accent (35 to 55), so the one accent stays the one
 * warm thing on the page.
 */
export const BACKGROUND_HUES = [210, 245, 280, 320, 355, 15, 150, 180] as const;

export type Background = { variant: BackgroundVariant; hue: number };

export const DEFAULT_BACKGROUND: Background = { variant: "plain", hue: BACKGROUND_HUES[0] };

const isVariant = (v: unknown): v is BackgroundVariant => (BACKGROUND_VARIANTS as readonly unknown[]).includes(v);
const isHue = (h: unknown): h is number => (BACKGROUND_HUES as readonly unknown[]).includes(h);

/** The account's row, as a choice; anything the app did not write reads as plain. */
export function backgroundFromRow(variant: string | null | undefined, hue: number | null | undefined): Background {
  return {
    variant: isVariant(variant) ? variant : "plain",
    hue: isHue(hue) ? hue : DEFAULT_BACKGROUND.hue,
  };
}

/** "gradient", "artwork", "colour-210", or "plain". */
export function backgroundCookieValue(b: Background): string {
  return b.variant === "colour" ? `colour-${b.hue}` : b.variant;
}

/**
 * The cookie, read back. Junk (a hand-edited value, a hue that is not a
 * swatch, an old format) is plain rather than an error: the worst a bad
 * cookie can do is show the page colour.
 */
export function parseBackground(value: string | null | undefined): Background {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "gradient" || v === "artwork" || v === "plain") return { ...DEFAULT_BACKGROUND, variant: v };
  const colour = /^colour-(\d{1,3})$/.exec(v);
  if (colour && isHue(Number(colour[1]))) return { variant: "colour", hue: Number(colour[1]) };
  return DEFAULT_BACKGROUND;
}

/** A year, like the theme's. */
export const BACKGROUND_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * A TMDB poster path the boot script and the layer will put in a CSS `url()`:
 * TMDB's own shape only, so nothing from storage can close the string.
 */
export function isPosterPath(path: unknown): path is string {
  return typeof path === "string" && /^\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/.test(path);
}

/** The w92 poster, the smallest TMDB serves: blurred this much, more pixels are wasted bytes. */
export function backgroundArtUrl(path: string) {
  return `https://image.tmdb.org/t/p/w92${path}`;
}

/**
 * Which of `count` titles today's is, from the person and the day: the same
 * all day on every device, a different one tomorrow. FNV-1a, since it only has
 * to spread, not to be secret.
 */
export function dailyIndex(userId: string, day: string, count: number): number {
  if (count <= 0) return -1;
  let hash = 0x811c9dc5;
  for (const ch of `${userId}:${day}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
}

/** "Dark · artwork background": the words Settings' summaries use. */
export function backgroundWords(variant: BackgroundVariant): string | null {
  return variant === "plain" ? null : `${variant} background`;
}
