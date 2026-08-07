/**
 * Seasonal dressing: three times a year the app puts on a costume.
 *
 * Deliberately a plain module with no server imports, so the switcher in the
 * account menu and the layout that resolves it can share the same definitions.
 *
 * TEMPORARY: the override half of this (the cookie, the picker in the account
 * menu, `SeasonSetting`'s "off" and the three forced values) exists so the
 * dressing can be looked at in August. When it has been tuned to taste, drop
 * the picker and the cookie and call `seasonForDate` directly — everything
 * under `data-season` in globals.css stays as it is.
 */

export type Season = "scifi" | "horror" | "holiday";

/** What the picker holds: follow the calendar, force one, or turn it all off. */
export type SeasonSetting = Season | "auto" | "off";

export const SEASON_COOKIE = "trekker_season";

export const SEASONS: Record<
  Season,
  {
    label: string;
    /** The short badge shown beside the wordmark. */
    chip: string;
    /** Month it belongs to, 0-indexed the way `Date` counts them. */
    month: number;
  }
> = {
  scifi: { label: "Sci-Fi Month", chip: "Sci-Fi Month", month: 4 },
  horror: { label: "Horror Month", chip: "Horror Month", month: 9 },
  holiday: { label: "Holiday Season", chip: "Holidays", month: 11 },
};

export const SEASON_VALUES: Season[] = ["scifi", "horror", "holiday"];

/** Which costume the calendar calls for, or none for the other nine months. */
export function seasonForDate(date: Date = new Date()): Season | null {
  const month = date.getMonth();
  return SEASON_VALUES.find((season) => SEASONS[season].month === month) ?? null;
}

export function parseSeasonSetting(value: string | undefined | null): SeasonSetting {
  if (value === "off" || value === "auto") return value;
  return SEASON_VALUES.includes(value as Season) ? (value as Season) : "auto";
}

export function resolveSeason(setting: SeasonSetting, date?: Date): Season | null {
  if (setting === "off") return null;
  if (setting === "auto") return seasonForDate(date);
  return setting;
}
