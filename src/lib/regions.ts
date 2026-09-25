/**
 * The countries TMDB answers watch providers for, as ISO 3166-1 codes. Kept
 * as a list rather than asked of `/watch/providers/regions` on every Settings
 * render: it changes a few times a year, and a region TMDB has since added is
 * one line here. Names come from the runtime's own table, in British English.
 */
export const WATCH_REGIONS = [
  "AD", "AE", "AG", "AL", "AO", "AR", "AT", "AU", "AZ", "BA", "BB", "BE", "BF", "BG", "BH", "BM", "BO", "BR", "BS",
  "BY", "BZ", "CA", "CD", "CH", "CI", "CL", "CM", "CO", "CR", "CU", "CV", "CY", "CZ", "DE", "DK", "DO", "DZ", "EC",
  "EE", "EG", "ES", "FI", "FJ", "FR", "GB", "GF", "GG", "GH", "GI", "GP", "GQ", "GR", "GT", "GY", "HK", "HN", "HR",
  "HU", "ID", "IE", "IL", "IN", "IQ", "IS", "IT", "JM", "JO", "JP", "KE", "KR", "KW", "LB", "LC", "LI", "LT", "LU",
  "LV", "LY", "MA", "MC", "MD", "ME", "MG", "MK", "ML", "MT", "MU", "MW", "MX", "MY", "MZ", "NE", "NG", "NI", "NL",
  "NO", "NZ", "OM", "PA", "PE", "PF", "PH", "PK", "PL", "PS", "PT", "PY", "QA", "RO", "RS", "SA", "SC", "SE", "SG",
  "SI", "SK", "SM", "SN", "SV", "TC", "TD", "TH", "TN", "TR", "TT", "TW", "TZ", "UA", "UG", "US", "UY", "VA", "VE",
  "XK", "YE", "ZA", "ZM", "ZW",
] as const;

const KNOWN = new Set<string>(WATCH_REGIONS);

export function isWatchRegion(code: unknown): code is string {
  return typeof code === "string" && KNOWN.has(code);
}

let names: Intl.DisplayNames | null = null;

/** "Netherlands" for NL; the code itself where the runtime has no name for it. */
export function regionName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["en-GB"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every region with its name, alphabetical by name, for the Settings select. */
export function regionOptions(): { code: string; name: string }[] {
  return WATCH_REGIONS.map((code) => ({ code, name: regionName(code) })).sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}
