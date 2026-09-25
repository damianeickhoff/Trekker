import "server-only";
import type { Facts } from "./achievements/catalogue";
import { todayKey } from "./dates";
import { db } from "./db";
import { queue } from "./refresh";
import {
  collectionKey,
  getCollection,
  getMovieDetails,
  getTvDetails,
  movieDetailsKey,
  tmdbConfigured,
  tmdbPeek,
  tvDetailsKey,
  type CollectionAnswer,
  type MovieDetails,
  type TvDetails,
} from "./tmdb";

/**
 * Facts about titles that TMDB knows and the watched rows do not: genres,
 * language, year, length, franchise. Kept in `TitleMeta`, shared by everyone,
 * because the badges ask about a whole history at once and none of it moves.
 *
 * Filled in the order that costs least. What `TitleMeta` already has is read
 * in two `IN` lists. What it lacks is looked for in `TmdbCache` next: any title
 * someone has opened has its details there, and reading a row costs nothing on
 * the network. Only then is TMDB asked, eighty titles a visit, behind the page
 * through the refresh queue, so a long history fills in over a few visits and
 * no visit waits on it. The badges say so while it is happening.
 */

type Wanted = { mediaType: "movie" | "tv"; tmdbId: number };

/** Titles read out of the cache per visit: each is one JSON parse of a details answer. */
export const PEEK_BUDGET = 200;
/** Titles asked of TMDB per visit. */
export const LOOKUP_BUDGET = 80;
/** Franchises asked of TMDB per visit. */
export const COLLECTION_BUDGET = 25;

const key = (w: Wanted) => `${w.mediaType}-${w.tmdbId}`;

type MetaRow = {
  mediaType: string;
  tmdbId: number;
  title: string;
  genres: string;
  originalLanguage: string | null;
  releaseDate: string | null;
  runtime: number | null;
  collectionId: number | null;
  collectionName: string | null;
};

export function toFacts(row: Pick<MetaRow, "title" | "genres" | "originalLanguage" | "releaseDate" | "runtime" | "collectionId">): Facts {
  const year = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : NaN;
  return {
    title: row.title,
    genres: row.genres ? row.genres.split(",").filter(Boolean) : [],
    originalLanguage: row.originalLanguage,
    year: Number.isFinite(year) ? year : null,
    runtime: row.runtime,
    collectionId: row.collectionId,
  };
}

/** The `TitleMeta` columns out of a details answer. */
export function metaFromDetails(mediaType: "movie" | "tv", d: MovieDetails | TvDetails) {
  const film = mediaType === "movie" ? (d as MovieDetails) : null;
  const show = mediaType === "tv" ? (d as TvDetails) : null;
  const runtime = film ? film.runtime : (show?.episode_run_time?.[0] ?? show?.last_episode_to_air?.runtime ?? null);
  return {
    title: film?.title || show?.name || "Untitled",
    genres: (d.genres ?? []).map((g) => g.name).join(","),
    originalLanguage: d.original_language ?? null,
    releaseDate: (film ? film.release_date : show?.first_air_date) || null,
    runtime: runtime && runtime > 0 ? runtime : null,
    collectionId: film?.belongs_to_collection?.id ?? null,
    collectionName: film?.belongs_to_collection?.name ?? null,
  };
}

async function writeMeta(w: Wanted, data: ReturnType<typeof metaFromDetails>) {
  await db.titleMeta
    .upsert({
      where: { mediaType_tmdbId: { mediaType: w.mediaType, tmdbId: w.tmdbId } },
      create: { mediaType: w.mediaType, tmdbId: w.tmdbId, ...data, fetchedAt: new Date() },
      update: { ...data, fetchedAt: new Date() },
    })
    .catch(() => undefined);
}

function detailsKeyOf(w: Wanted) {
  return w.mediaType === "movie" ? movieDetailsKey(w.tmdbId) : tvDetailsKey(w.tmdbId);
}

/** Chunked, so a long history never builds one statement past SQLite's variable limit. */
async function readMeta(wanted: Wanted[]): Promise<MetaRow[]> {
  const out: MetaRow[] = [];
  for (const mediaType of ["movie", "tv"] as const) {
    const ids = [...new Set(wanted.filter((w) => w.mediaType === mediaType).map((w) => w.tmdbId))];
    for (let i = 0; i < ids.length; i += 500) {
      out.push(
        ...(await db.titleMeta.findMany({
          where: { mediaType, tmdbId: { in: ids.slice(i, i + 500) } },
          select: {
            mediaType: true,
            tmdbId: true,
            title: true,
            genres: true,
            originalLanguage: true,
            releaseDate: true,
            runtime: true,
            collectionId: true,
            collectionName: true,
          },
        })),
      );
    }
  }
  return out;
}

export type FactsResult = {
  facts: Map<string, Facts>;
  /** Collection names by id, for the franchise progress. */
  collectionNames: Map<number, string>;
  /** Titles with no facts yet; the genre and franchise badges read low until this is 0. */
  pending: number;
};

/**
 * Facts for every wanted title that has them, topping the table up on the
 * way. `offline` reads the table and nothing else: the unlock check after a
 * viewing runs often and must never reach the network or parse the cache.
 */
export async function titleFacts(wanted: Wanted[], { offline = false } = {}): Promise<FactsResult> {
  const facts = new Map<string, Facts>();
  const collectionNames = new Map<number, string>();
  const rows = await readMeta(wanted);
  for (const row of rows) {
    facts.set(`${row.mediaType}-${row.tmdbId}`, toFacts(row));
    if (row.collectionId && row.collectionName) collectionNames.set(row.collectionId, row.collectionName);
  }

  let missing = wanted.filter((w) => !facts.has(key(w)));
  if (offline || missing.length === 0) return { facts, collectionNames, pending: missing.length };

  for (const w of missing.slice(0, PEEK_BUDGET)) {
    const { path, params } = detailsKeyOf(w);
    const details = await tmdbPeek<MovieDetails | TvDetails>(path, params).catch(() => null);
    if (!details) continue;
    const data = metaFromDetails(w.mediaType, details);
    await writeMeta(w, data);
    facts.set(key(w), toFacts(data));
    if (data.collectionId && data.collectionName) collectionNames.set(data.collectionId, data.collectionName);
  }

  missing = missing.filter((w) => !facts.has(key(w)));
  if (tmdbConfigured()) {
    for (const w of missing.slice(0, LOOKUP_BUDGET)) {
      // Deduped by title in the queue, so two tabs on the badges page ask once.
      queue
        .enqueue(`facts:${key(w)}`, async () => {
          const details = await (w.mediaType === "movie" ? getMovieDetails(w.tmdbId) : getTvDetails(w.tmdbId));
          await writeMeta(w, metaFromDetails(w.mediaType, details));
        })
        .catch(() => undefined);
    }
  }
  return { facts, collectionNames, pending: missing.length };
}

export type Franchise = { id: number; name: string; owned: number; total: number };

/**
 * How complete each franchise someone has two or more films of is, most
 * complete first. One film of a series can never be a finished franchise, so
 * the lookups stay proportional to what is close. Counted against the films
 * TMDB lists as released, so an entry TMDB has since dropped cannot push a
 * franchise past complete.
 */
export async function franchiseProgress(
  films: { tmdbId: number; facts: Facts | null }[],
  collectionNames: Map<number, string>,
  { offline = false, today = todayKey() } = {},
): Promise<{ franchises: Franchise[]; pending: number }> {
  const owned = new Map<number, Set<number>>();
  for (const f of films) {
    const id = f.facts?.collectionId;
    if (!id) continue;
    owned.set(id, (owned.get(id) ?? new Set()).add(f.tmdbId));
  }
  const candidates = [...owned.entries()].filter(([, ids]) => ids.size >= 2).sort((a, b) => b[1].size - a[1].size);

  const out: Franchise[] = [];
  let pending = 0;
  let asked = 0;
  for (const [id, ids] of candidates) {
    const { path } = collectionKey(id);
    const answer = await tmdbPeek<CollectionAnswer>(path).catch(() => null);
    if (!answer) {
      pending += 1;
      if (!offline && tmdbConfigured() && asked < COLLECTION_BUDGET) {
        asked += 1;
        queue.enqueue(`collection:${id}`, () => getCollection(id)).catch(() => undefined);
      }
      continue;
    }
    const parts = new Set((answer.parts ?? []).filter((p) => p.release_date && p.release_date <= today).map((p) => p.id));
    if (parts.size === 0) continue;
    out.push({
      id,
      name: answer.name || collectionNames.get(id) || "Franchise",
      owned: [...ids].filter((m) => parts.has(m)).length,
      total: parts.size,
    });
  }
  out.sort((a, b) => b.owned / b.total - a.owned / a.total);
  return { franchises: out, pending };
}
