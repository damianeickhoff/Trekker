/**
 * The streaming services a person pays for, and the region they watch in.
 *
 * Stored on `User.providers` as TMDB provider ids, comma separated, by the
 * current app's settings page. Plain functions with no database, so the rules
 * can be tested and shared by the title page and the request button alike.
 */

/**
 * The services worth offering, each with every TMDB id that means the same
 * subscription: TMDB lists one service under several ids, and which one a
 * title comes back under varies by title and region, so one id per service
 * silently missed half the matches. Carried over from the current app.
 */
export type Provider = { id: number; name: string; ids: number[] };

export const KNOWN_PROVIDERS: Provider[] = [
  { id: 8, name: "Netflix", ids: [8, 1796] },
  { id: 9, name: "Prime Video", ids: [9, 119, 2100] },
  { id: 337, name: "Disney+", ids: [337, 390, 2074] },
  { id: 350, name: "Apple TV+", ids: [350, 2552] },
  { id: 1899, name: "HBO Max", ids: [1899, 384, 1825, 3186] },
  { id: 15, name: "Hulu", ids: [15] },
  { id: 531, name: "Paramount+", ids: [531, 1770, 4085] },
  { id: 386, name: "Peacock", ids: [386, 387] },
  { id: 619, name: "SkyShowtime", ids: [619, 1773] },
  { id: 71, name: "Discovery+", ids: [71, 510, 520, 4353] },
  { id: 72, name: "Videoland", ids: [72, 30] },
  { id: 563, name: "Viaplay", ids: [563, 76] },
  { id: 283, name: "Crunchyroll", ids: [283, 1968] },
  { id: 11, name: "MUBI", ids: [11] },
];

export function parseProviders(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** Every id that counts as "subscribes to this", flattened. */
export function expandProviders(chosen: number[]): Set<number> {
  const wanted = new Set(chosen);
  const all = new Set<number>();
  for (const provider of KNOWN_PROVIDERS) {
    if (!wanted.has(provider.id)) continue;
    for (const id of provider.ids) all.add(id);
  }
  // An id the list above does not know still matches itself.
  for (const id of chosen) all.add(id);
  return all;
}

/**
 * The services among `offers` that this person pays for, once each and by the
 * service's own name: TMDB lists "Netflix" and "Netflix Standard with Ads" as
 * two offers, and both are the one subscription. This is the request warning:
 * a title already here is one worth asking about before spending the server's
 * disk on it.
 */
export function subscribedAmong(chosen: number[], offers: { id: number; name: string }[]): string[] {
  if (chosen.length === 0) return [];
  const subscribed = expandProviders(chosen);
  const wanted = new Set(chosen);
  const names = offers
    .filter((o) => subscribed.has(o.id))
    .map((o) => KNOWN_PROVIDERS.find((p) => wanted.has(p.id) && p.ids.includes(o.id))?.name ?? o.name);
  return [...new Set(names)];
}

/** Whether to ask before requesting: only when something they pay for already has it. */
export function requestNeedsConfirming(alreadyOn: string[]): boolean {
  return alreadyOn.length > 0;
}

/** The person's own region, else the instance's, else the US, as TMDB keys them. */
export function regionFor(own: string | null | undefined): string {
  const pick = (v: string | null | undefined) => {
    const code = v?.trim().toUpperCase();
    return code && /^[A-Z]{2}$/.test(code) ? code : null;
  };
  return pick(own) ?? pick(process.env.WATCH_REGION) ?? "US";
}

/** The Availability row's `providers` JSON, one region of it. */
export type RegionSummary = {
  link: string | null;
  stream: { id: number; name: string }[];
  free: { id: number; name: string }[];
};

export function summaryFor(json: string | null | undefined, region: string): RegionSummary | null {
  if (!json) return null;
  try {
    const all = JSON.parse(json) as Record<string, RegionSummary>;
    return all[region] ?? { link: null, stream: [], free: [] };
  } catch {
    return null;
  }
}
