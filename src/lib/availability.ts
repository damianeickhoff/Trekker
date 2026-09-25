import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { gate } from "./gates";
import { getWatchProviders, offersFor, tmdbConfigured, type MediaType } from "./tmdb";
import { openSecret } from "./token-vault";

/**
 * Where a title can be watched, written to `Availability` by the daily job and
 * never looked up on a render.
 *
 * Plex and Overseerr sit behind small interfaces so the job can run with
 * either, both or neither: an instance without credentials gets `null` for
 * that source and simply records nothing about it, and tests hand in fakes.
 * With credentials present the real clients below make the same calls the
 * current app makes, with the same auth.
 */

export type TitleRef = { mediaType: MediaType; tmdbId: number; title: string; year?: string | null };

export type PlexSource = {
  /** The library item for this title, or null when it is not on the server. */
  find(title: TitleRef): Promise<{ ratingKey: string } | null>;
};

export type SeerrSource = {
  /** Every title the instance has news about, keyed `${mediaType}-${tmdbId}`. */
  statuses(): Promise<Map<string, "requested" | "available">>;
};

export type Sources = { plex: PlexSource | null; seerr: SeerrSource | null };

function normaliseUrl(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

// ---------------------------------------------------------------------------
// Plex

type PlexMetadata = { ratingKey: string; type: string; title: string; year?: number; Guid?: { id?: string }[] };

async function plexFetch<T>(url: string, token: string, path: string, params: Record<string, string> = {}) {
  try {
    const target = new URL(normaliseUrl(url) + path);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    target.searchParams.set("X-Plex-Token", token);
    await gate.take("plex");
    const res = await fetch(target, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      // A home server that is asleep should cost seconds, not the whole job.
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function sameTitle(a: string, b: string) {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return clean(a) === clean(b);
}

/**
 * Finds a title by searching the library for its name, then trusting, in
 * order: an item whose TMDB guid matches (modern Plex agents carry one), an
 * exact title within a year, and nothing else. A near miss reported as "on
 * Plex" is worse than a miss, because pressing play then opens the wrong film.
 */
export function plexSource(url: string, token: string): PlexSource {
  return {
    async find(title) {
      const data = await plexFetch<{ MediaContainer?: { Metadata?: PlexMetadata[] } }>(url, token, "/search", {
        query: title.title,
        limit: "20",
      });
      const wanted = title.mediaType === "tv" ? "show" : "movie";
      const candidates = (data?.MediaContainer?.Metadata ?? []).filter((m) => m.type === wanted).slice(0, 3);

      for (const item of candidates) {
        const meta = await plexFetch<{ MediaContainer?: { Metadata?: PlexMetadata[] } }>(
          url,
          token,
          `/library/metadata/${item.ratingKey}`,
          { includeGuids: "1" },
        );
        const guids = meta?.MediaContainer?.Metadata?.[0]?.Guid ?? [];
        if (guids.some((g) => g.id === `tmdb://${title.tmdbId}`)) return { ratingKey: item.ratingKey };
      }

      const year = title.year ? Number(title.year) : null;
      const exact = candidates.find(
        (m) => sameTitle(m.title, title.title) && (!year || !m.year || Math.abs(m.year - year) <= 1),
      );
      return exact ? { ratingKey: exact.ratingKey } : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Overseerr / Jellyseerr

/** Overseerr's media status codes: 2 pending, 3 processing, 4 partial, 5 available. */
function seerrKind(status: number | undefined): "requested" | "available" | null {
  if (status === 2 || status === 3) return "requested";
  if (status === 4 || status === 5) return "available";
  return null;
}

async function seerrFetch<T>(url: string, apiKey: string, path: string): Promise<T | null> {
  try {
    await gate.take("overseerr");
    const res = await fetch(normaliseUrl(url) + path, {
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * The whole media list in small pages. Overseerr holds a row for everything it
 * has scanned, which is the whole library, so one huge page was slow enough to
 * time out; a page that fails costs its own marks and no more.
 */
export function seerrSource(url: string, apiKey: string): SeerrSource {
  const PAGE = 200;
  const CEILING = 10_000;
  type Page = {
    pageInfo?: { pages?: number };
    results?: { tmdbId?: number; mediaType?: string; status?: number }[];
  };

  return {
    async statuses() {
      const found = new Map<string, "requested" | "available">();
      const absorb = (page: Page | null) => {
        for (const row of page?.results ?? []) {
          const kind = seerrKind(row.status);
          if (row.tmdbId && (row.mediaType === "movie" || row.mediaType === "tv") && kind) {
            found.set(`${row.mediaType}-${row.tmdbId}`, kind);
          }
        }
      };
      const fetchPage = (n: number) =>
        seerrFetch<Page>(url, apiKey, `/api/v1/media?take=${PAGE}&skip=${n * PAGE}&filter=all`);

      const first = await fetchPage(0);
      if (!first) return found;
      absorb(first);
      const pages = Math.min(first.pageInfo?.pages ?? 1, Math.ceil(CEILING / PAGE));
      const rest = Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => i + 1);
      for (const page of await mapLimit(rest, 4, fetchPage)) absorb(page);
      return found;
    },
  };
}

/**
 * The instance's connections, from the admin account (the oldest), where the
 * current app keeps them. The server token rather than anyone's own: this is
 * a question about the library, not about one viewer.
 */
export async function availabilitySources(): Promise<Sources> {
  const admin = await db.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { plexUrl: true, plexToken: true, seerrUrl: true, seerrApiKey: true },
  });
  const plexToken = openSecret(admin?.plexToken);
  const seerrKey = openSecret(admin?.seerrApiKey);
  return {
    plex: admin?.plexUrl && plexToken ? plexSource(admin.plexUrl, plexToken) : null,
    seerr: admin?.seerrUrl && seerrKey ? seerrSource(admin.seerrUrl, seerrKey) : null,
  };
}

// ---------------------------------------------------------------------------
// The job's half

/** The instance default region, then any region an account has chosen. */
export async function regionsInUse(): Promise<string[]> {
  const configured = process.env.WATCH_REGION?.trim().toUpperCase();
  const fallback = configured && /^[A-Z]{2}$/.test(configured) ? configured : "US";
  const rows = await db.user.findMany({ where: { region: { not: null } }, select: { region: true }, distinct: ["region"] });
  const own = rows.map((r) => r.region!.trim().toUpperCase()).filter((r) => /^[A-Z]{2}$/.test(r));
  return [...new Set([fallback, ...own])];
}

/**
 * Everything on somebody's watchlist, favourites or lists, and every show
 * somebody is part-way through: what the marks are drawn on. The last is for
 * Home, whose Up next card offers Play on Plex and whose rails carry the mark;
 * a show with nothing left to watch does not need either.
 */
export async function titlesToCheck(): Promise<TitleRef[]> {
  const [watchlist, favourites, listItems, inProgress] = await Promise.all([
    db.watchlistItem.findMany({ select: { mediaType: true, tmdbId: true, title: true } }),
    db.favourite.findMany({ select: { mediaType: true, tmdbId: true, title: true } }),
    db.mediaListItem.findMany({ select: { mediaType: true, tmdbId: true, title: true, year: true } }),
    db.titleState.findMany({
      where: { watchedCount: { gt: 0 }, nextEpisode: { not: null } },
      select: { showId: true, showName: true },
      distinct: ["showId"],
    }),
  ]);
  const byKey = new Map<string, TitleRef>();
  const rows: { mediaType: string; tmdbId: number; title: string; year?: string | null }[] = [
    ...listItems,
    ...watchlist,
    ...favourites,
    ...inProgress.map((s) => ({ mediaType: "tv", tmdbId: s.showId, title: s.showName })),
  ];
  for (const row of rows) {
    if (row.mediaType !== "movie" && row.mediaType !== "tv") continue;
    const key = `${row.mediaType}-${row.tmdbId}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        mediaType: row.mediaType,
        tmdbId: row.tmdbId,
        title: row.title,
        year: row.year ?? null,
      });
    }
  }
  return [...byKey.values()];
}

type ProviderSummary = Record<
  string,
  { link: string | null; stream: { id: number; name: string }[]; free: { id: number; name: string }[] }
>;

/**
 * Checks each title against every source it can and writes the answer.
 * Overseerr is swept once for the lot; Plex and TMDB are asked per title, as
 * one job each through `schedule` (the refresh queue, in the app) and each
 * call through its own rate gate. A source that fails leaves that
 * part of the row as it was rather than claiming the title vanished.
 */
export async function refreshAvailability(
  titles: TitleRef[],
  sources: Sources,
  regions: string[],
  schedule: <T>(key: string, task: () => Promise<T>) => Promise<T> = (_key, task) => task(),
) {
  const seerr = sources.seerr ? await sources.seerr.statuses().catch(() => null) : null;
  const tmdb = tmdbConfigured();
  let written = 0;

  await mapLimit(titles, 4, (title) =>
    schedule(`availability:${title.mediaType}-${title.tmdbId}`, async () => {
      const plex = sources.plex ? await sources.plex.find(title).catch(() => undefined) : undefined;

      let providers: string | undefined;
      if (tmdb) {
        const all = await getWatchProviders(title.mediaType, title.tmdbId, { force: true }).catch(() => null);
        if (all) {
          const summary: ProviderSummary = {};
          for (const region of regions) {
            const offers = offersFor(all, region);
            if (!offers) continue;
            const brief = (list: { provider_id: number; provider_name: string }[]) =>
              list.map((p) => ({ id: p.provider_id, name: p.provider_name }));
            summary[region] = { link: offers.link, stream: brief(offers.stream), free: brief(offers.free) };
          }
          providers = JSON.stringify(summary);
        }
      }

      const data = {
        ...(plex !== undefined ? { onPlex: plex !== null, plexRatingKey: plex?.ratingKey ?? null } : {}),
        ...(seerr ? { overseerrStatus: seerr.get(`${title.mediaType}-${title.tmdbId}`) ?? "none" } : {}),
        ...(providers !== undefined ? { providers } : {}),
        checkedAt: new Date(),
      };
      await db.availability.upsert({
        where: { mediaType_tmdbId: { mediaType: title.mediaType, tmdbId: title.tmdbId } },
        create: { mediaType: title.mediaType, tmdbId: title.tmdbId, ...data },
        update: data,
      });
      written += 1;
    }),
  );

  return { checked: titles.length, written, plex: Boolean(sources.plex), overseerr: seerr !== null };
}
