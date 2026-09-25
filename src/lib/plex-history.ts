import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { plexGet, ratingKeyFrom, serverConnection, tmdbIdForKey, type PlexConnection } from "./plex-server";
import { logPlexReport, type PlexReport } from "./plex-scrobble";
import { searchMulti, tmdbConfigured } from "./tmdb";
import { openSecret } from "./token-vault";

/**
 * What someone finished on Plex, read into their plays: the current app's
 * sync, run by the refresh job every half hour for everyone with a Plex
 * identity (and by Sync now in the Plex sheet) rather than by an open tab.
 *
 * Two sources, because neither is complete. The server's play history has
 * the dates and a stable id per viewing (`${ratingKey}:${viewedAt}`, the
 * current app's form, so its rows are recognised), and covers items since
 * removed. The library's own watched flags catch what was marked watched
 * without being played, which writes no history at all; they are state, not
 * events, so they only ever add a first viewing, and are read once a day
 * because walking a whole library is the expensive half.
 *
 * Each question goes to the party entitled to answer it: history and the
 * account list to the server's token, since a Plex Home profile's own token
 * is refused both, and the watched flags to the viewer's token, since
 * "watched" is a fact about an account.
 */

export type SyncSummary = { logged: number; already: number; skipped: number; unmatched: string[] };
export type SyncOutcome = { ok: true; summary: SyncSummary } | { ok: false; error: string };

/** How far back history is read on each run. Plex keeps it for ever; the first run takes this many. */
const HISTORY_LIMIT = 500;
/** How often the library's watched flags are walked, per person. */
const LIBRARY_EVERY_MS = 24 * 60 * 60 * 1000;

type HistoryRow = {
  type?: string;
  ratingKey?: string;
  grandparentKey?: string;
  grandparentRatingKey?: string;
  title?: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  year?: number;
  viewedAt?: number;
  lastViewedAt?: number;
  viewCount?: number;
};

type Entry = PlexReport & { origin: "history" | "library"; year: number | null };

function toEntry(row: HistoryRow, origin: Entry["origin"], at: number | undefined): Entry | null {
  if (row.type !== "movie" && row.type !== "episode") return null;
  if (!at) return null;
  const watchedAt = new Date(at * 1000);
  return {
    type: row.type,
    ratingKey: row.ratingKey ?? null,
    grandparentRatingKey: row.grandparentRatingKey ?? ratingKeyFrom(row.grandparentKey),
    title: row.title ?? "Untitled",
    showTitle: row.grandparentTitle ?? null,
    seasonNumber: row.parentIndex ?? null,
    episodeNumber: row.index ?? null,
    watchedAt,
    year: row.year ?? null,
    origin,
    // A history row is one viewing and says which; a watched flag is state, with no id.
    sourceRef: origin === "history" && row.ratingKey ? `${row.ratingKey}:${at}` : null,
  };
}

/** The server's own id for this person: plex.tv ids where it reports them, else by name. */
async function serverAccountId(server: PlexConnection, who: { plexAccountId: string | null; plexUsername: string | null }) {
  const data = await plexGet<{ MediaContainer?: { Account?: { id?: number | string; name?: string }[] } }>(server, "/accounts");
  const accounts = data?.MediaContainer?.Account ?? [];
  const byId = who.plexAccountId ? accounts.find((a) => String(a.id) === who.plexAccountId) : undefined;
  if (byId?.id !== undefined) return String(byId.id);
  const name = who.plexUsername?.toLowerCase();
  const byName = name ? accounts.find((a) => a.name?.toLowerCase() === name) : undefined;
  return byName?.id !== undefined ? String(byName.id) : null;
}

async function history(server: PlexConnection, accountId: string): Promise<Entry[]> {
  const data = await plexGet<{ MediaContainer?: { Metadata?: HistoryRow[] } }>(
    server,
    "/status/sessions/history/all",
    {
      accountID: accountId,
      sort: "viewedAt:desc",
      "X-Plex-Container-Start": "0",
      "X-Plex-Container-Size": String(HISTORY_LIMIT),
    },
    15_000,
  );
  return (data?.MediaContainer?.Metadata ?? []).flatMap((row) => toEntry(row, "history", row.viewedAt) ?? []);
}

async function watchedFlags(viewer: Pick<PlexConnection, "url" | "token">): Promise<Entry[]> {
  const sections = await plexGet<{ MediaContainer?: { Directory?: { key?: string; type?: string }[] } }>(viewer, "/library/sections");
  const wanted = (sections?.MediaContainer?.Directory ?? []).filter((s) => s.key && (s.type === "movie" || s.type === "show"));
  const out: Entry[] = [];
  for (const section of wanted) {
    const data = await plexGet<{ MediaContainer?: { Metadata?: HistoryRow[] } }>(
      viewer,
      `/library/sections/${section.key}/all`,
      // Type 4 asks for a show section's episodes directly, rather than walking shows and seasons.
      { type: section.type === "movie" ? "1" : "4", "X-Plex-Container-Start": "0", "X-Plex-Container-Size": "5000" },
      30_000,
    );
    for (const row of data?.MediaContainer?.Metadata ?? []) {
      // Filtered here, not in the query: Plex puts the operator in the parameter's
      // name (`viewCount>=1`), which URL encoding mangles into a filter Plex ignores.
      if (!row.viewCount || row.viewCount < 1) continue;
      const entry = toEntry({ ...row, type: section.type === "movie" ? "movie" : "episode" }, "library", row.lastViewedAt ?? row.viewedAt);
      if (entry) out.push(entry);
    }
  }
  return out;
}

/**
 * The last resort for an item the modern agents never matched: a title
 * search, insisting on the medium and, for a film, the year within one.
 * Weaker evidence than an id, so an ambiguous answer is no answer.
 */
async function searchFor(mediaType: "movie" | "tv", title: string, year: number | null) {
  if (!tmdbConfigured() || !title || title === "Untitled") return null;
  const found = await searchMulti(title).catch(() => null);
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const same = (found?.items ?? []).filter((i) => i.mediaType === mediaType && clean(i.title) === clean(title));
  if (year !== null) return same.find((i) => i.year && Math.abs(Number(i.year) - year) <= 1)?.id ?? null;
  return same.length === 1 ? same[0].id : null;
}

export async function syncPlexHistory(userId: string, options: { library?: boolean; now?: Date } = {}): Promise<SyncOutcome> {
  const now = options.now ?? new Date();
  const server = await serverConnection();
  if (!server) return { ok: false, error: "No Plex server is linked." };
  const who = await db.user.findUnique({
    where: { id: userId },
    select: { plexAccountId: true, plexUsername: true, plexAuthToken: true, plexSyncedAt: true },
  });
  if (!who?.plexAccountId && !who?.plexUsername) return { ok: false, error: "Sign in with Plex first, so we know which viewing is yours." };

  const accountId = await serverAccountId(server, who);
  const viewerToken = openSecret(who.plexAuthToken);
  const walkLibrary =
    Boolean(viewerToken) && (options.library ?? (!who.plexSyncedAt || now.getTime() - who.plexSyncedAt.getTime() > LIBRARY_EVERY_MS));

  const [played, flagged] = await Promise.all([
    accountId ? history(server, accountId) : Promise.resolve([]),
    walkLibrary ? watchedFlags({ url: server.url, token: viewerToken! }) : Promise.resolve([]),
  ]);
  if (!accountId && flagged.length === 0) {
    return { ok: false, error: `This server has no account called “${who.plexUsername ?? who.plexAccountId}”.` };
  }

  // What is already known: a watched flag for any of these adds nothing.
  const [films, episodes] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId }, select: { movieId: true } }),
    db.watchedEpisode.findMany({ where: { userId }, select: { showId: true, seasonNumber: true, episodeNumber: true } }),
  ]);
  const seen = new Set([
    ...films.map((f) => `movie-${f.movieId}`),
    ...episodes.map((e) => `tv-${e.showId}-${e.seasonNumber}-${e.episodeNumber}`),
  ]);

  // One lookup per library item, not per viewing: a show watched through is one key.
  const subjects = new Map<string, { mediaType: "movie" | "tv"; key: string; title: string; year: number | null }>();
  for (const e of [...played, ...flagged]) {
    const key = e.type === "episode" ? e.grandparentRatingKey : e.ratingKey;
    if (!key) continue;
    const mediaType = e.type === "episode" ? "tv" : "movie";
    subjects.set(`${mediaType}:${key}`, {
      mediaType,
      key,
      title: (e.type === "episode" ? e.showTitle : e.title) ?? e.title,
      year: e.type === "episode" ? null : e.year,
    });
  }
  const ids = new Map<string, number | null>();
  const pairs = await mapLimit([...subjects.entries()], 4, async ([k, s]) => ({
    k,
    id: (await tmdbIdForKey(server, s.key, s.mediaType)) ?? (await searchFor(s.mediaType, s.title, s.year)),
  }));
  for (const { k, id } of pairs) ids.set(k, id);

  const summary: SyncSummary = { logged: 0, already: 0, skipped: 0, unmatched: [] };
  for (const [k, s] of subjects) if (!ids.get(k) && summary.unmatched.length < 5) summary.unmatched.push(s.title);

  // Oldest first, so the earliest viewing becomes the first.
  const entries = [...played, ...flagged].sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());
  for (const e of entries) {
    const mediaType = e.type === "episode" ? "tv" : "movie";
    const key = e.type === "episode" ? e.grandparentRatingKey : e.ratingKey;
    const id = key ? ids.get(`${mediaType}:${key}`) : null;
    if (!id) {
      summary.skipped += 1;
      continue;
    }
    const identity = mediaType === "movie" ? `movie-${id}` : `tv-${id}-${e.seasonNumber}-${e.episodeNumber}`;
    if (e.origin === "library" && seen.has(identity)) {
      summary.already += 1;
      continue;
    }
    const { outcome } = await logPlexReport(userId, e, server, id).catch(() => ({ outcome: "skipped" as const }));
    if (outcome === "logged") {
      summary.logged += 1;
      seen.add(identity);
    } else if (outcome === "duplicate") summary.already += 1;
    else summary.skipped += 1;
  }

  await db.user.update({ where: { id: userId }, data: { plexSyncedAt: now } });
  return { ok: true, summary };
}

/** Everyone the half-hourly pass reads: a Plex identity, and the server linked. */
export async function plexSyncAccounts() {
  const rows = await db.user.findMany({
    where: { OR: [{ plexAccountId: { not: null } }, { plexUsername: { not: null } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
