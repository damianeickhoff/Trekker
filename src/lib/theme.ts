/**
 * The theme lives in a cookie rather than on the user row, so the root layout
 * can put a concrete value on <html> in the first byte without a database read.
 * The cookie is written by the browser; the server only ever reads it.
 */

export const THEME_COOKIE = "trekker_theme";

export type Theme = "dark" | "light";
export type ThemePreference = Theme | "system";

/** Dark is the primary design; anything unreadable falls back to it. */
export const DEFAULT_PREFERENCE: ThemePreference = "dark";

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  const v = value?.trim().toLowerCase();
  if (v === "dark" || v === "light" || v === "system") return v;
  return DEFAULT_PREFERENCE;
}

/**
 * What the server writes on <html>. It cannot see the OS setting, so "system"
 * renders dark and the boot script corrects it before first paint.
 */
export function serverTheme(preference: ThemePreference): Theme {
  return preference === "light" ? "light" : "dark";
}

/** A year, so the choice outlives a browser restart but not forever. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
