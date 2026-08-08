import "server-only";
import { cache } from "react";
import { db } from "./db";
import { getAdmin } from "./admin";
import { openSecret } from "./token-vault";

/**
 * Overseerr / Jellyseerr integration. Same shape of API in both, so one client
 * covers them. Everything fails soft — an unreachable instance simply means no
 * request button rather than a broken page.
 */

export type SeerrConnection = { url: string; apiKey: string };

/** Overseerr media status codes. */
export const SEERR_STATUS = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
} as const;

export type SeerrStatusKind = "requestable" | "pending" | "partial" | "available";

export type SeerrSeason = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  kind: SeerrStatusKind;
  /**
   * The season has episodes still to come.
   *
   * This is what separates "the server is missing episodes" from "the server has
   * everything that exists so far". Overseerr reports both as partially
   * available, because from its side they are the same fact — but only the first
   * one is a problem anybody can do something about.
   */
  airing: boolean;
  /**
   * The premiere has happened.
   *
   * Separate from `airing` because a season part-way through its run is both
   * released *and* still airing, and collapsing the two claimed a show that
   * started last week had not started at all.
   */
  released: boolean;
};

export type SeerrState = {
  kind: SeerrStatusKind;
  /**
   * Per-season status for a show, when the instance told us.
   *
   * A show is rarely all-or-nothing: the server can hold seasons 2 and 3 while
   * season 1 was never grabbed, and the whole-title status collapses that to
   * "partially available" — which is true and useless, because it leaves no way
   * to ask for the part that is missing.
   */
  seasons?: SeerrSeason[];
};

function normaliseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function seerrFetch<T>(
  connection: SeerrConnection,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetch(normaliseUrl(connection.url) + path, {
      ...init,
      headers: {
        "X-Api-Key": connection.apiKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    if (res.status === 204) return {} as T;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Confirms the instance answers and returns its version. */
export async function verifySeerr(url: string, apiKey: string) {
  const data = await seerrFetch<{ version?: string }>({ url, apiKey }, "/api/v1/status");
  if (!data) return null;
  return { version: data.version ?? "unknown" };
}

/** Instance-wide, stored on the admin account. See {@link getPlexConnection}. */
export async function getSeerrConnection(): Promise<SeerrConnection | null> {
  const admin = await getAdmin();
  if (!admin) return null;

  const user = await db.user.findUnique({
    where: { id: admin.id },
    select: { seerrUrl: true, seerrApiKey: true },
  });

  const apiKey = openSecret(user?.seerrApiKey);
  if (!user?.seerrUrl || !apiKey) return null;
  return { url: user.seerrUrl, apiKey };
}

function toKind(status: number | undefined): SeerrStatusKind {
  switch (status) {
    // Anything already filed on the instance reads as "requested" — the
    // download pipeline is Overseerr's business, not the viewer's.
    case SEERR_STATUS.PENDING:
    case SEERR_STATUS.PROCESSING:
      return "pending";
    case SEERR_STATUS.PARTIALLY_AVAILABLE:
      return "partial";
    case SEERR_STATUS.AVAILABLE:
      return "available";
    default:
      return "requestable";
  }
}

function toState(status: number | undefined): SeerrState {
  return { kind: toKind(status) };
}

type SeerrTitle = {
  mediaInfo?: {
    status?: number;
    seasons?: { seasonNumber?: number; status?: number }[];
  };
  /** The show's own season list, mirrored from TMDB. */
  seasons?: {
    seasonNumber?: number;
    name?: string;
    episodeCount?: number;
    airDate?: string | null;
  }[];
  nextEpisodeToAir?: { seasonNumber?: number } | null;
};

/**
 * Current status of a title on the instance, keyed by its TMDB id.
 *
 * Memoised per request. The title page renders the request control twice — once
 * for the phone layout and once for the desktop one — and without this that is
 * two round trips to Overseerr on every page load, for an answer that cannot
 * have changed between them.
 */
export const getSeerrState = cache(async function getSeerrState(
  connection: SeerrConnection,
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<SeerrState | null> {
  const data = await seerrFetch<SeerrTitle>(connection, `/api/v1/${mediaType}/${tmdbId}`);
  if (!data) return null;

  const state = toState(data.mediaInfo?.status);
  if (mediaType === "movie") return state;

  // Overseerr answers in two halves: the show's seasons come from TMDB and
  // carry names and counts but no status, while `mediaInfo.seasons` carries
  // status for only the seasons it has ever heard about. Joining them is what
  // produces a complete list — a season absent from the second half has simply
  // never been asked for.
  const requested = new Map(
    (data.mediaInfo?.seasons ?? [])
      .filter((season) => typeof season.seasonNumber === "number")
      .map((season) => [season.seasonNumber!, toKind(season.status)]),
  );

  // The season the show is currently part-way through, if any. Overseerr gives
  // one next-episode pointer for the whole series, which is enough: a show can
  // only be mid-run in one season at a time.
  const runningSeason = data.nextEpisodeToAir?.seasonNumber ?? null;
  const now = Date.now();

  const seasons: SeerrSeason[] = (data.seasons ?? [])
    // Specials are season zero and are almost never what anyone means by
    // "I want season one".
    .filter((season) => (season.seasonNumber ?? 0) > 0 && (season.episodeCount ?? 0) > 0)
    .map((season) => {
      const starts = season.airDate ? Date.parse(season.airDate) : NaN;

      return {
        seasonNumber: season.seasonNumber!,
        name: season.name || `Season ${season.seasonNumber}`,
        episodeCount: season.episodeCount ?? 0,
        kind: requested.get(season.seasonNumber!) ?? "requestable",
        // Either the run is still going, or it has not started at all.
        airing:
          season.seasonNumber === runningSeason ||
          (Number.isFinite(starts) && starts > now),
        // An unparseable or missing air date counts as released: saying nothing
        // is better than telling someone a season they watched last night is
        // not out.
        released: !Number.isFinite(starts) || starts <= now,
      };
    });

  return { ...state, seasons: seasons.length > 0 ? seasons : undefined };
});

/**
 * Every title Overseerr knows about, keyed `${mediaType}-${tmdbId}`.
 *
 * One call for a whole page of posters. Asking per title would be a request per
 * card, which is why the poster badges use this and the title page — where
 * there is exactly one — uses {@link getSeerrState}.
 */
export async function getSeerrStatuses(
  connection: SeerrConnection,
): Promise<Map<string, SeerrState>> {
  const statuses = new Map<string, SeerrState>();

  const data = await seerrFetch<{
    results?: { tmdbId?: number; mediaType?: string; status?: number }[];
  }>(connection, "/api/v1/media?take=500&skip=0&filter=all&sort=added");

  for (const row of data?.results ?? []) {
    if (!row.tmdbId || (row.mediaType !== "movie" && row.mediaType !== "tv")) continue;
    const state = toState(row.status);
    // "Requestable" is the absence of news; only carry the interesting ones.
    if (state.kind === "requestable") continue;
    statuses.set(`${row.mediaType}-${row.tmdbId}`, state);
  }

  return statuses;
}

/**
 * Files a request.
 *
 * For a show, `seasons` names exactly which ones to ask for; omitting it means
 * all of them, which is what the button did before there was any way to choose.
 * Overseerr takes the literal string `"all"` for that case rather than an
 * enumerated list, and rejects an empty array — so the caller must not send one.
 */
export async function requestOnSeerr(
  connection: SeerrConnection,
  mediaType: "movie" | "tv",
  tmdbId: number,
  seasons?: number[],
) {
  const body: Record<string, unknown> = { mediaType, mediaId: tmdbId };
  if (mediaType === "tv") {
    body.seasons = seasons && seasons.length > 0 ? seasons : "all";
  }

  const result = await seerrFetch<{ id?: number }>(connection, "/api/v1/request", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return result !== null;
}
