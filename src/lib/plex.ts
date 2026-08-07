import "server-only";
import { db } from "./db";
import { getAdmin } from "./admin";

/**
 * Talks to a user's own Plex Media Server over its local HTTP API.
 * Everything here fails soft: a server that is off, unreachable or wrong
 * simply means "not on Plex", never a broken page.
 */

export type PlexConnection = {
  url: string;
  token: string;
  machineId: string | null;
};

export type PlexMatch = {
  title: string;
  year: number | null;
  /** Deep link into the Plex web app. */
  href: string;
  /** The `plex://` form, for opening the app itself. Null without a machine id. */
  appHref: string | null;
  librarySection: string | null;
};

type PlexMetadata = {
  ratingKey: string;
  key: string;
  type: string;
  title: string;
  year?: number;
  librarySectionTitle?: string;
};

function normaliseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function plexFetch<T>(
  connection: Pick<PlexConnection, "url" | "token">,
  path: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  try {
    const url = new URL(normaliseUrl(connection.url) + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("X-Plex-Token", connection.token);

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Plex libraries change often and a dead server should not hang a page.
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Confirms the server answers and returns its machine identifier. */
export async function verifyPlex(url: string, token: string) {
  const data = await plexFetch<{
    MediaContainer: { machineIdentifier?: string; friendlyName?: string };
  }>({ url, token }, "/identity");

  if (!data?.MediaContainer?.machineIdentifier) return null;
  return {
    machineId: data.MediaContainer.machineIdentifier,
    name: data.MediaContainer.friendlyName ?? "Plex",
  };
}

/**
 * The connection is instance-wide: it lives on the admin account and every
 * profile uses it.
 */
export async function getPlexConnection(userId?: string): Promise<PlexConnection | null> {
  const admin = await getAdmin();
  if (!admin) return null;

  const [server, viewer] = await Promise.all([
    db.user.findUnique({
      where: { id: admin.id },
      select: { plexUrl: true, plexToken: true, plexMachineId: true },
    }),
    // Everyone in a Plex Home has their own account, and watched state is per
    // account. Given a user we therefore talk to the server as *them*, using
    // the token their own Plex sign-in produced — otherwise every profile here
    // would see the admin's viewing history.
    userId
      ? db.user.findUnique({ where: { id: userId }, select: { plexAuthToken: true } })
      : Promise.resolve(null),
  ]);

  if (!server?.plexUrl || !server.plexToken) return null;

  return {
    url: server.plexUrl,
    token: viewer?.plexAuthToken || server.plexToken,
    machineId: server.plexMachineId,
  };
}

function titlesMatch(a: string, b: string) {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return clean(a) === clean(b);
}

/** Looks for a title in the user's library. Returns null when it is not there. */
export async function findOnPlex(
  connection: PlexConnection,
  query: { title: string; year?: string | null; mediaType: "movie" | "tv" },
): Promise<PlexMatch | null> {
  const data = await plexFetch<{ MediaContainer: { Metadata?: PlexMetadata[] } }>(
    connection,
    "/search",
    { query: query.title, limit: "20" },
  );

  const wanted = query.mediaType === "tv" ? "show" : "movie";
  const results = (data?.MediaContainer?.Metadata ?? []).filter((m) => m.type === wanted);
  if (results.length === 0) return null;

  const year = query.year ? Number(query.year) : null;
  const exact = results.filter((m) => titlesMatch(m.title, query.title));
  const pool = exact.length > 0 ? exact : results;

  // Prefer an exact title match in the right year; fall back to the first hit.
  const match =
    (year ? pool.find((m) => m.year && Math.abs(m.year - year) <= 1) : undefined) ?? pool[0];

  if (exact.length === 0 && !(year && match.year && Math.abs(match.year - year) <= 1)) {
    return null;
  }

  return {
    title: match.title,
    year: match.year ?? null,
    librarySection: match.librarySectionTitle ?? null,
    href: buildDeepLink(connection, match),
    appHref: buildAppLink(connection, match),
  };
}

export type PlexSession = {
  title: string;
  /** "S01E04 · Episode name" for an episode, the year for a film. */
  subtitle: string;
  mediaType: "movie" | "tv";
  /** Percentage through, 0-100. */
  progress: number;
  paused: boolean;
  player: string | null;
  /** Minutes left, rounded. */
  remaining: number;
  thumb: string | null;
  art: string | null;
  /** Deep link into the Plex web app. */
  href: string;
  /** The `plex://` form, for opening the app itself. */
  appHref: string | null;
  /** The title's own page here, when the library item is matched to TMDB. */
  tmdbId: number | null;
  /** Whose playback this is; only set on a friend's session. */
  who?: { id: string; name: string; avatar: string | null };
};

export type SessionMetadata = PlexMetadata & {
  grandparentRatingKey?: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  viewOffset?: number;
  duration?: number;
  thumb?: string;
  grandparentThumb?: string;
  art?: string;
  grandparentArt?: string;
  User?: { id?: string | number; title?: string };
  Player?: { title?: string; state?: string };
};

/**
 * What the given Plex account is playing right now, or null.
 *
 * The server connection is instance-wide, so `/status/sessions` returns
 * everybody's playback. Sessions are matched to the viewer by plex.tv account
 * id where we have one, falling back to the username — without a match this
 * would happily show one household member's viewing on another's dashboard.
 */
export async function getNowPlaying(
  connection: PlexConnection,
  identity: { accountId: string | null; username: string | null },
): Promise<PlexSession | null> {
  const sessions = await getSessions(connection);
  const mine = matchSession(sessions, identity);
  return mine ? describeSession(connection, mine) : null;
}

/** Every session on the server, for callers that match more than one viewer. */
export async function getSessions(connection: PlexConnection) {
  const data = await plexFetch<{ MediaContainer: { Metadata?: SessionMetadata[] } }>(
    connection,
    "/status/sessions",
  );
  return data?.MediaContainer?.Metadata ?? [];
}

/** Which of those sessions belongs to a given plex.tv identity, if any. */
export function matchSession(
  sessions: SessionMetadata[],
  identity: { accountId: string | null; username: string | null },
) {
  if (!identity.accountId && !identity.username) return null;

  return (
    sessions.find((s) => {
      if (identity.accountId && s.User?.id !== undefined) {
        if (String(s.User.id) === identity.accountId) return true;
      }
      if (identity.username && s.User?.title) {
        return s.User.title.toLowerCase() === identity.username.toLowerCase();
      }
      return false;
    }) ?? null
  );
}

/**
 * Turns a raw session into the shape the card renders. The TMDB lookup is what
 * lets the title link back into Trekker rather than only out to Plex.
 */
export async function describeSession(
  connection: PlexConnection,
  session: SessionMetadata,
): Promise<PlexSession | null> {
  if (!session.duration) return null;

  const offset = session.viewOffset ?? 0;
  const isEpisode = session.type === "episode";
  const key = isEpisode ? session.grandparentRatingKey : session.ratingKey;

  return {
    title: isEpisode ? (session.grandparentTitle ?? session.title) : session.title,
    subtitle: isEpisode
      ? `S${String(session.parentIndex ?? 0).padStart(2, "0")}E${String(session.index ?? 0).padStart(2, "0")} · ${session.title}`
      : session.year
        ? String(session.year)
        : "Movie",
    mediaType: isEpisode ? "tv" : "movie",
    progress: Math.min(100, Math.round((offset / session.duration) * 100)),
    paused: session.Player?.state === "paused",
    player: session.Player?.title ?? null,
    remaining: Math.max(0, Math.round((session.duration - offset) / 60000)),
    thumb: imageUrl(connection, session.grandparentThumb ?? session.thumb),
    art: imageUrl(connection, session.art ?? session.grandparentArt),
    href: buildDeepLink(connection, session),
    appHref: buildAppLink(connection, session),
    tmdbId: key ? await getPlexTmdbId(connection, key).catch(() => null) : null,
  };
}

/**
 * The server keeps its own account list, and its ids are not plex.tv ids — the
 * owner is always `1` locally. History can only be filtered by the local id, so
 * it has to be looked up: by plex.tv id where the server reports one, otherwise
 * by name.
 */
export async function findPlexAccountId(
  connection: PlexConnection,
  identity: { accountId: string | null; username: string | null },
): Promise<string | null> {
  const data = await plexFetch<{
    MediaContainer: { Account?: { id?: number | string; name?: string }[] };
  }>(connection, "/accounts");

  const accounts = data?.MediaContainer?.Account ?? [];

  const byId = identity.accountId
    ? accounts.find((a) => String(a.id) === identity.accountId)
    : undefined;
  if (byId?.id !== undefined) return String(byId.id);

  const byName = identity.username
    ? accounts.find((a) => a.name?.toLowerCase() === identity.username!.toLowerCase())
    : undefined;

  return byName?.id !== undefined ? String(byName.id) : null;
}

export type PlexHistoryEntry = {
  type: "movie" | "episode";
  ratingKey: string | null;
  /** For an episode, the show it belongs to. */
  grandparentRatingKey: string | null;
  title: string;
  showTitle: string | null;
  /** Only meaningful for a film. */
  year: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: Date;
};

type HistoryMetadata = {
  type?: string;
  ratingKey?: string;
  /** History rows carry the show as a path, not as a rating key. */
  grandparentKey?: string;
  grandparentRatingKey?: string;
  title?: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  viewedAt?: number;
  lastViewedAt?: number;
  /** How many times this account has watched it. Absent means never. */
  viewCount?: number;
};

/**
 * `/status/sessions/history/all` reports the parent and grandparent as keys
 * (`/library/metadata/1234`) rather than as the `*RatingKey` fields the rest of
 * the API uses — which is why matching an episode's show used to come up empty
 * for every row.
 */
function ratingKeyFrom(key: string | undefined, explicit: string | undefined) {
  if (explicit) return explicit;
  if (!key) return null;
  const match = /(\d+)\s*$/.exec(key);
  return match ? match[1] : null;
}

/**
 * What this account has finished on the server, newest first. Plex only records
 * an entry once it considers something watched, so this is a watch log rather
 * than a progress feed.
 */
export async function getPlexHistory(
  connection: PlexConnection,
  accountId: string,
  limit = 500,
): Promise<PlexHistoryEntry[]> {
  const data = await plexFetch<{ MediaContainer: { Metadata?: HistoryMetadata[] } }>(
    connection,
    "/status/sessions/history/all",
    {
      accountID: accountId,
      sort: "viewedAt:desc",
      "X-Plex-Container-Start": "0",
      "X-Plex-Container-Size": String(limit),
    },
  );

  const rows = data?.MediaContainer?.Metadata ?? [];
  const entries: PlexHistoryEntry[] = [];

  for (const row of rows) {
    if (row.type !== "movie" && row.type !== "episode") continue;
    if (!row.viewedAt) continue;

    entries.push({
      type: row.type,
      ratingKey: row.ratingKey ?? null,
      grandparentRatingKey: ratingKeyFrom(row.grandparentKey, row.grandparentRatingKey),
      title: row.title ?? "Untitled",
      showTitle: row.grandparentTitle ?? null,
      year: row.year ?? null,
      seasonNumber: row.parentIndex ?? null,
      episodeNumber: row.index ?? null,
      // Plex reports seconds since the epoch.
      watchedAt: new Date(row.viewedAt * 1000),
    });
  }

  return entries;
}

/**
 * Everything in the library this account has marked as watched.
 *
 * The history endpoint only records *playback*. Marking something watched in
 * Plex without playing it — which is what most people do to catch a tracker up
 * — writes no history row at all, so anything that relies on history alone
 * silently misses it. The library's own `viewCount` is the real answer, and it
 * is per account, which is why the connection has to carry the viewer's token.
 */
export async function getPlexWatchedLibrary(
  connection: PlexConnection,
): Promise<PlexHistoryEntry[]> {
  const sections = await plexFetch<{
    MediaContainer: { Directory?: { key?: string; type?: string }[] };
  }>(connection, "/library/sections");

  const wanted = (sections?.MediaContainer?.Directory ?? []).filter(
    (section) => section.type === "movie" || section.type === "show",
  );

  const entries: PlexHistoryEntry[] = [];

  for (const section of wanted) {
    if (!section.key) continue;

    // type 1 = movie, type 4 = episode. Asking for episodes directly avoids
    // walking shows and seasons to get at them.
    const type = section.type === "movie" ? "1" : "4";

    const data = await plexFetch<{ MediaContainer: { Metadata?: HistoryMetadata[] } }>(
      connection,
      `/library/sections/${section.key}/all`,
      {
        type,
        "X-Plex-Container-Start": "0",
        "X-Plex-Container-Size": "5000",
      },
    );

    for (const row of data?.MediaContainer?.Metadata ?? []) {
      // Filtered here rather than in the query. Plex's filter syntax puts the
      // operator in the parameter *name* (`viewCount>=1`), which a URL encoder
      // turns into `viewCount%3E=1` — silently ignored, so the whole library
      // came back and every episode in it looked watched.
      if (!row.viewCount || row.viewCount < 1) continue;

      const isEpisode = section.type === "show";

      entries.push({
        type: isEpisode ? "episode" : "movie",
        ratingKey: row.ratingKey ?? null,
        grandparentRatingKey: ratingKeyFrom(row.grandparentKey, row.grandparentRatingKey),
        title: row.title ?? "Untitled",
        showTitle: row.grandparentTitle ?? null,
        year: row.year ?? null,
        seasonNumber: row.parentIndex ?? null,
        episodeNumber: row.index ?? null,
        // `lastViewedAt` is when Plex thinks you saw it; falling back to now
        // for an item that somehow carries no timestamp.
        watchedAt: row.lastViewedAt ? new Date(row.lastViewedAt * 1000) : new Date(),
      });
    }
  }

  return entries;
}

/**
 * The TMDB id a library item is matched to. Present only where the library uses
 * the modern Plex agents; the legacy ones carry their own scheme, which is why
 * a miss here has to fall back to a title search.
 */
export async function getPlexTmdbId(
  connection: PlexConnection,
  ratingKey: string,
): Promise<number | null> {
  const data = await plexFetch<{
    MediaContainer: { Metadata?: { Guid?: { id?: string }[] }[] };
  }>(connection, `/library/metadata/${ratingKey}`, { includeGuids: "1" });

  for (const guid of data?.MediaContainer?.Metadata?.[0]?.Guid ?? []) {
    const match = /^tmdb:\/\/(\d+)$/.exec(guid.id ?? "");
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Plex artwork lives behind the server's token, so it is proxied through this
 * app rather than linked directly — the token must not reach the browser.
 */
function imageUrl(connection: PlexConnection, path: string | undefined) {
  if (!path) return null;
  return `/api/plex/image?path=${encodeURIComponent(path)}`;
}

/** Fetches an artwork path from the server, for the image proxy route. */
export async function fetchPlexImage(connection: PlexConnection, path: string) {
  try {
    const url = new URL(normaliseUrl(connection.url) + path);
    url.searchParams.set("X-Plex-Token", connection.token);

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return null;
  }
}

function buildDeepLink(connection: PlexConnection, item: PlexMetadata) {
  const key = encodeURIComponent(item.key || `/library/metadata/${item.ratingKey}`);

  if (connection.machineId) {
    return `https://app.plex.tv/desktop/#!/server/${connection.machineId}/details?key=${key}`;
  }
  // No machine id (older server or unverified): fall back to the local web app.
  return `${normaliseUrl(connection.url)}/web/index.html#!/server/local/details?key=${key}`;
}

/**
 * The `plex://` form, which the installed apps claim. Needs the server's
 * machine identifier — without one there is nothing to point the app at.
 */
function buildAppLink(connection: PlexConnection, item: PlexMetadata) {
  if (!connection.machineId) return null;
  const key = encodeURIComponent(item.key || `/library/metadata/${item.ratingKey}`);
  return `plex://preplay/?metadataKey=${key}&server=${connection.machineId}`;
}
