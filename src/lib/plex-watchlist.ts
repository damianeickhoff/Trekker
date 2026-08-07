import "server-only";
import { mapLimit } from "./concurrency";
import { clientIdentifier } from "./plex-auth";

/**
 * A Plex account's watchlist.
 *
 * This one does not live on the media server — it is a plex.tv account feature,
 * served by their metadata provider and keyed to the user's own auth token. So
 * it needs the token captured during "Continue with Plex", not the instance's
 * server token.
 */

const METADATA = "https://metadata.provider.plex.tv";
const DISCOVER = "https://discover.provider.plex.tv";

/** Plex caps a page well below this; the loop below follows totalSize anyway. */
const PAGE = 100;

export type PlexWatchlistEntry = {
  title: string;
  year: number | null;
  mediaType: "movie" | "tv";
  tmdbId: number;
};

type Guid = { id?: string };

type Item = {
  ratingKey?: string;
  title?: string;
  year?: number;
  type?: string;
  Guid?: Guid[];
};

/** Plex carries external ids as `tmdb://1399` in a `Guid` list. */
function tmdbIdOf(item: Item) {
  for (const guid of item.Guid ?? []) {
    const match = /^tmdb:\/\/(\d+)$/.exec(guid.id ?? "");
    if (match) return Number(match[1]);
  }
  return null;
}

export class PlexWatchlistError extends Error {}

function headers(authToken: string) {
  return {
    Accept: "application/json",
    "X-Plex-Token": authToken,
    "X-Plex-Product": "Trekker",
    "X-Plex-Client-Identifier": clientIdentifier(),
  };
}

async function get<T>(url: URL, authToken: string): Promise<T> {
  // Plex accepts the token either way, and some of these endpoints are fussier
  // about the query parameter than the header. Sending both costs nothing.
  url.searchParams.set("X-Plex-Token", authToken);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: headers(authToken),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PlexWatchlistError("Could not reach plex.tv");
  }

  if (res.status === 401 || res.status === 403) {
    throw new PlexWatchlistError("Plex rejected the sign-in. Reconnect your Plex account.");
  }

  if (!res.ok) {
    // Plex explains itself in the body, and a bare status code has cost enough
    // guesswork already. The token is stripped so it cannot reach a screen.
    const detail = (await res.text().catch(() => ""))
      .replace(/[?&]X-Plex-Token=[^&"'\s]*/gi, "")
      .trim()
      .slice(0, 300);

    throw new PlexWatchlistError(
      `plex.tv returned ${res.status} for ${url.pathname}${detail ? ` — ${detail}` : ""}`,
    );
  }

  return (await res.json().catch(() => null)) as T;
}

type Container = {
  MediaContainer?: { totalSize?: number; size?: number; Metadata?: Item[] };
};

/**
 * The listing endpoint is picky: anything beyond the container window and a
 * token is liable to come back as a 400, and it does not return external ids at
 * all. Ids come from a second call per item against the discover service, which
 * is what every other Plex client does too.
 */
export async function getPlexWatchlist(authToken: string): Promise<PlexWatchlistEntry[]> {
  const items: Item[] = [];
  let start = 0;

  for (;;) {
    // These are the parameters Plex's own web client sends. The listing is
    // fussy about what it is given — `includeFields` in particular is what it
    // rejected before — so this deliberately mirrors a known-good request.
    const url = new URL(`${DISCOVER}/library/sections/watchlist/all`);
    url.searchParams.set("includeCollections", "1");
    url.searchParams.set("includeExternalMedia", "1");
    url.searchParams.set("includeAdvanced", "1");
    url.searchParams.set("includeMeta", "1");
    url.searchParams.set("X-Plex-Container-Start", String(start));
    url.searchParams.set("X-Plex-Container-Size", String(PAGE));

    const data = await get<Container>(url, authToken).catch(async (error) => {
      // The older host still answers for accounts the discover service does
      // not, so a failure there is worth one retry rather than a dead end.
      if (start > 0) throw error;

      const fallback = new URL(`${METADATA}/library/sections/watchlist/all`);
      fallback.searchParams.set("X-Plex-Container-Start", "0");
      fallback.searchParams.set("X-Plex-Container-Size", String(PAGE));
      return get<Container>(fallback, authToken).catch(() => {
        // Report the first failure: it is the one against the endpoint we mean
        // to be using.
        throw error;
      });
    });

    const page = data?.MediaContainer?.Metadata ?? [];
    items.push(...page);

    const total = data?.MediaContainer?.totalSize ?? items.length;
    start += page.length;

    if (page.length === 0 || start >= total) break;
    // A server that keeps claiming more than it sends must not loop forever.
    if (items.length > 2000) break;
  }

  const resolved = await mapLimit(items, 5, async (item) => {
    const direct = tmdbIdOf(item);
    if (direct !== null) return { item, tmdbId: direct };
    if (!item.ratingKey) return { item, tmdbId: null };

    const url = new URL(`${DISCOVER}/library/metadata/${item.ratingKey}`);
    const detail = await get<Container>(url, authToken).catch(() => null);
    const full = detail?.MediaContainer?.Metadata?.[0];

    return { item: { ...item, ...full }, tmdbId: full ? tmdbIdOf(full) : null };
  });

  const entries: PlexWatchlistEntry[] = [];

  for (const { item, tmdbId } of resolved) {
    // Anything Plex cannot tie to a TMDB id has nothing to become here.
    if (tmdbId === null) continue;

    entries.push({
      title: item.title ?? "Untitled",
      year: item.year ?? null,
      mediaType: item.type === "show" ? "tv" : "movie",
      tmdbId,
    });
  }

  return entries;
}

/**
 * Adds a title to the account's plex.tv watchlist.
 *
 * Plex's watchlist is keyed by *its* metadata rating key, not by a TMDB id, so
 * the id has to be traded for one first — there is no lookup endpoint that
 * takes an external id, hence the search. A title that cannot be found on
 * Plex's own metadata service simply cannot be watchlisted, and says so.
 */
export async function addToPlexWatchlist(
  authToken: string,
  entry: { tmdbId: number; mediaType: "movie" | "tv"; title: string; year: number | null },
): Promise<{ ok: boolean; reason?: string }> {
  const found = await findPlexRatingKey(authToken, entry);
  if (!found.ratingKey) return { ok: false, reason: found.reason };
  const ratingKey = found.ratingKey;

  const url = new URL(`${DISCOVER}/actions/addToWatchlist`);
  url.searchParams.set("ratingKey", ratingKey);
  url.searchParams.set("X-Plex-Token", authToken);

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: headers(authToken),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    // Already on the list comes back as a 400; that is a success as far as
    // "make sure this is on Plex" is concerned.
    if (res.ok || res.status === 400) return { ok: true };
    return { ok: false, reason: `plex.tv returned ${res.status}` };
  } catch {
    return { ok: false, reason: "could not reach plex.tv" };
  }
}

type SearchResult = {
  MediaContainer?: {
    SearchResult?: { Metadata?: Item[] }[];
    SearchResults?: { SearchResult?: { Metadata?: Item }[] }[];
  };
};

/**
 * Trades a TMDB id for Plex's own rating key, matching on the guid.
 *
 * Reports *why* it failed rather than just that it did — the search is the part
 * most likely to break, and "could not be sent" on its own is not something
 * anyone can act on.
 */
async function findPlexRatingKey(
  authToken: string,
  entry: { tmdbId: number; mediaType: "movie" | "tv"; title: string; year: number | null },
): Promise<{ ratingKey: string | null; reason?: string }> {
  const url = new URL(`${DISCOVER}/library/search`);
  url.searchParams.set("query", entry.title);
  url.searchParams.set("searchTypes", entry.mediaType === "tv" ? "tv" : "movies");
  // Required, and the endpoint says so rather than guessing a default.
  // "discover" is Plex's own catalogue — the one a watchlist is keyed against,
  // as opposed to the rental and ad-supported storefronts.
  url.searchParams.set("searchProviders", "discover");
  url.searchParams.set("limit", "10");
  url.searchParams.set("includeMetadata", "1");

  let data: SearchResult | null = null;
  try {
    data = await get<SearchResult>(url, authToken);
  } catch (error) {
    return {
      ratingKey: null,
      reason: `search failed — ${error instanceof Error ? error.message : "unknown"}`,
    };
  }

  if (!data) return { ratingKey: null, reason: "search returned nothing readable" };

  // Plex has shipped two shapes for this response; accept either rather than
  // betting on which one a given account gets.
  const candidates: Item[] = [
    ...(data.MediaContainer?.SearchResult?.flatMap((group) => group.Metadata ?? []) ?? []),
    ...(data.MediaContainer?.SearchResults?.flatMap(
      (group) => group.SearchResult?.map((result) => result.Metadata).filter(Boolean) ?? [],
    ) as Item[]) ?? [],
  ];

  // The guid is the only certain match; title and year are a fallback for
  // results that come back without one.
  if (candidates.length === 0) {
    return { ratingKey: null, reason: "Plex search returned no results for that title" };
  }

  const byGuid = candidates.find((item) => tmdbIdOf(item) === entry.tmdbId);
  if (byGuid?.ratingKey) return { ratingKey: byGuid.ratingKey };

  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const byTitle = candidates.find(
    (item) =>
      item.ratingKey &&
      clean(item.title ?? "") === clean(entry.title) &&
      (entry.year === null || !item.year || Math.abs(item.year - entry.year) <= 1),
  );

  if (byTitle?.ratingKey) return { ratingKey: byTitle.ratingKey };

  return {
    ratingKey: null,
    reason: `no Plex match among ${candidates.length} result${
      candidates.length === 1 ? "" : "s"
    }`,
  };
}
