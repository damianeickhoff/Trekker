import "server-only";
import { expandProviders, getUserProviders, KNOWN_PROVIDERS } from "./providers";
import { getWatchlist, type WatchlistRow } from "./watchlist";

/**
 * "What should I watch tonight?"
 *
 * Everything this needs is already on the watchlist rows — how long a thing is
 * and where it streams are both cached there by `watchlist.ts` — so this is a
 * filter over data the app was already collecting rather than anything new.
 */

export type TonightFilters = {
  /** Longest thing worth starting, in minutes. Null means no limit. */
  maxRuntime: number | null;
  kind: "all" | "movie" | "tv";
  /** Only what one of the viewer's own subscriptions carries. */
  streamableOnly: boolean;
};

export type TonightPick = WatchlistRow & {
  /** Which of the viewer's services carry it, by name. */
  onServices: string[];
};

export type Tonight = {
  picks: TonightPick[];
  /** Rows that match except that nobody has looked up how long they are yet. */
  unknownLength: TonightPick[];
  /** How many watchlist rows there were before filtering. */
  total: number;
  /** True when the viewer has not told us what they subscribe to. */
  noProviders: boolean;
};

export const DEFAULT_FILTERS: TonightFilters = {
  maxRuntime: null,
  kind: "all",
  streamableOnly: false,
};

export function parseFilters(params: {
  runtime?: string;
  kind?: string;
  streaming?: string;
}): TonightFilters {
  const runtime = Number(params.runtime);

  return {
    maxRuntime: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
    kind: params.kind === "movie" || params.kind === "tv" ? params.kind : "all",
    streamableOnly: params.streaming === "1",
  };
}

export async function getTonight(
  userId: string,
  filters: TonightFilters,
): Promise<Tonight> {
  const [rows, chosen] = await Promise.all([
    getWatchlist(userId),
    getUserProviders(userId),
  ]);

  const subscribed = expandProviders(chosen);
  // Ids back to the handful of names worth showing: TMDB returns "Netflix
  // basic with Ads" and similar as separate providers, and the viewer only
  // wants to be told "Netflix".
  const nameFor = new Map<number, string>();
  for (const provider of KNOWN_PROVIDERS) {
    if (!chosen.includes(provider.id)) continue;
    for (const id of provider.ids) nameFor.set(id, provider.name);
  }

  const withServices: TonightPick[] = rows.map((row) => ({
    ...row,
    onServices: [...new Set(row.streamingIds.filter((id) => subscribed.has(id)).map((id) => nameFor.get(id)!))],
  }));

  const matching = withServices.filter((row) => {
    if (filters.kind !== "all" && row.mediaType !== filters.kind) return false;
    if (filters.streamableOnly && row.onServices.length === 0) return false;
    return true;
  });

  // A row whose length has not been looked up yet cannot be judged against a
  // time limit. Hiding it would make a fresh watchlist look empty for the first
  // few visits, so it is set aside and shown separately instead.
  const picks: TonightPick[] = [];
  const unknownLength: TonightPick[] = [];

  for (const row of matching) {
    if (filters.maxRuntime === null) {
      picks.push(row);
    } else if (row.runtime === null) {
      unknownLength.push(row);
    } else if (row.runtime <= filters.maxRuntime) {
      picks.push(row);
    }
  }

  return {
    picks,
    unknownLength,
    total: rows.length,
    noProviders: chosen.length === 0,
  };
}

/**
 * Three of them, chosen at random.
 *
 * The seed comes from the caller so the shuffle survives a re-render and only
 * changes when the viewer asks it to — a list that reshuffled itself on every
 * navigation would be impossible to choose from.
 */
export function shuffle<T>(items: T[], seed: number, count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  let state = seed || 1;

  while (pool.length > 0 && picked.length < count) {
    // Cheap deterministic PRNG. Nothing here needs to be unguessable, it just
    // needs to be the same answer twice for the same seed.
    state = (state * 1664525 + 1013904223) % 4294967296;
    picked.push(pool.splice(state % pool.length, 1)[0]);
  }

  return picked;
}
