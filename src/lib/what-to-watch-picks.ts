import { DEFAULT_FILTERS, RUNTIME_CEILING, YEAR_CEILING, YEAR_FLOOR } from "./smart-filters";
import { discoverParams, type MediaType } from "./smart-query";
import {
  GENRE_NAMES,
  NEVER_KEYWORDS,
  NEVER_TV,
  type Audience,
  type Recipe,
  type TimeChoice,
  type Vibe,
} from "./what-to-watch-quiz";

/**
 * "What to watch", answered: the four answers as TMDB discover queries, and
 * what comes back ranked against what the rows say about the viewer. Pure, so
 * the ranking rules can be tested without TMDB; `what-to-watch.ts` does the
 * asking and the reading.
 *
 * Two pools, not one. The popular pool is what people are watching and
 * supplies the three picks; the acclaimed pool is sorted by score behind a
 * heavy vote floor and supplies the wildcard. Ranking one merged list by
 * quality alone made every answer return the same handful of all-time greats.
 */

export type Pool = "popular" | "acclaimed";

/**
 * The vote floors. The acclaimed one is brutal on purpose: `vote_average.desc`
 * behind a low floor is a wall of titles with forty votes and a perfect ten,
 * and the wildcard is the one card claiming to be objectively good. The
 * popular one is about churn rather than quality: genres with a constant supply
 * of cheap new titles, horror above all, otherwise fill a page with last
 * month's releases and two hundred votes between them.
 */
export const POOL_VOTES: Record<Pool, Record<MediaType, number>> = {
  popular: { movie: 400, tv: 60 },
  acclaimed: { movie: 1000, tv: 200 },
};

/** How long a film has to have been out before it is offered, in days: roughly the cinema-to-home window. */
export const CINEMA_WINDOW_DAYS = 45;

/** Below this many candidates the pool is too thin to rank, and the filters are loosened. */
export const THIN = 8;

/** How many of the strongest candidates the three picks are drawn from. */
export const CONTENDERS = 8;

export type QueryInput = {
  medium: MediaType;
  pool: Pool;
  audience: Audience;
  vibe: Vibe;
  time: TimeChoice;
  /** Drops the length, the start of the era and the quality floor. Never the genre. */
  loose: boolean;
  /** The viewer's services, for the query narrowed to what they can play. Empty for the others. */
  providers: number[];
  region: string;
  today: string;
};

/**
 * One pool's discover parameters. The shelf, the services, the era and the
 * length are the smart list builder's (`discoverParams`), so "on my services"
 * and "under two hours" mean the same thing here as in a smart list; the mood
 * is laid over it, since a mood is raw genre ids, keywords and exclusions that
 * a smart list has no words for.
 */
export function quizParams(q: QueryInput): Record<string, string> {
  const movie = q.medium === "movie";
  const recipe: Recipe = movie ? q.vibe.movie : q.vibe.tv;
  const lengthMax = movie ? q.time.maxRuntime : q.time.maxEpisode;
  const lengthMin = movie ? null : q.time.minEpisode;

  const p = discoverParams(
    {
      ...DEFAULT_FILTERS,
      kind: q.medium,
      source: q.pool === "popular" ? "popular" : "top-rated",
      providers: q.providers,
      mode: "advanced",
      yearMin: !q.loose && q.vibe.from ? q.vibe.from : YEAR_FLOOR,
      yearMax: q.vibe.to ?? YEAR_CEILING,
      // TMDB reads `with_runtime` as the episode length for a series, which is
      // why the time question asks shows about episode shape.
      runtimeMin: q.loose ? 0 : (lengthMin ?? 0),
      runtimeMax: q.loose ? RUNTIME_CEILING : (lengthMax ?? RUNTIME_CEILING),
    },
    q.medium,
    { region: q.region, today: q.today },
  )!;

  // Comma is AND, pipe is OR. Required genres are AND-ed; preferred ones are
  // scored rather than asked for, except as a broad OR when nothing else
  // narrows the query. A keyword already has, and an OR-ed genre list stacked
  // on it would throw away most of what it found.
  const keywords = recipe.keywords ?? [];
  if (keywords.length) p.with_keywords = keywords.join("|");
  if (recipe.require.length) p.with_genres = recipe.require.join(",");
  else if (recipe.prefer.length && !keywords.length) p.with_genres = recipe.prefer.join("|");

  const without = [...((movie ? q.audience.withoutMovieGenres : q.audience.withoutTvGenres) ?? []), ...(movie ? [] : NEVER_TV)];
  if (without.length) p.without_genres = without.join(",");
  p.include_adult = "false";
  p.without_keywords = NEVER_KEYWORDS.join(",");

  p["vote_count.gte"] = String(q.loose ? 20 : POOL_VOTES[q.pool][q.medium]);
  if (q.pool === "popular" && !q.loose) p["vote_average.gte"] = "6.3";
  if (q.vibe.language) p.with_original_language = q.vibe.language;

  // Nothing not out yet, and for films nothing still only in cinemas: a pick
  // you would need a ticket for is not an answer to "tonight". The query
  // narrowed to the viewer's services is exempt, since a title on one of them
  // is provably playable whatever its age. Survives the loose retry with the
  // genre: offering something unwatchable is a wrong answer, not a near miss.
  const date = movie ? "primary_release_date" : "first_air_date";
  const watchable = movie && q.providers.length === 0 ? daysBefore(q.today, CINEMA_WINDOW_DAYS) : q.today;
  const key = `${date}.lte`;
  if (!p[key] || watchable < p[key]) p[key] = watchable;

  return p;
}

function daysBefore(day: string, days: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Candidates

export type Title = {
  id: number;
  mediaType: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  /** Audience score as a percentage. */
  score: number;
  year: string | null;
  genreIds: number[];
};

export type Candidate = {
  key: string;
  item: Title;
  /** Which pools it turned up in: the wildcard is drawn from the acclaimed one. */
  pools: Set<Pool>;
  /** The best placing the popular pool gave it, as a popularity prior. */
  rank: number;
  /** Turned up in the query narrowed to the viewer's services. */
  restricted: boolean;
};

/** One page of one query, as it came back. */
export type PoolPage = { pool: Pool; restricted: boolean; page: number; items: Title[] };

/** The pages merged into one candidate per title. Titles from the stricter pass win where both have one. */
export function collect(pages: PoolPage[], into = new Map<string, Candidate>()): Map<string, Candidate> {
  for (const page of pages) {
    page.items.forEach((item, index) => {
      const key = `${item.mediaType}-${item.id}`;
      // Only the popular pool gives a placing: a title's position in a list
      // sorted by score says nothing about whether anyone is watching it.
      const placing = page.pool === "popular" && !page.restricted ? (page.page - 1) * 20 + index : Number.MAX_SAFE_INTEGER;
      const existing = into.get(key);
      if (existing) {
        existing.pools.add(page.pool);
        existing.rank = Math.min(existing.rank, placing);
        existing.restricted ||= page.restricted;
      } else {
        into.set(key, { key, item, pools: new Set([page.pool]), rank: placing, restricted: page.restricted });
      }
    });
  }
  return into;
}

/** What the rows say about the viewer and the candidates, all keyed `movie-603`. */
export type ViewerFacts = {
  /** Films watched. */
  watchedFilms: ReadonlySet<string>;
  /** Shows begun and not finished, with how many episodes are seen. */
  partway: ReadonlyMap<string, number>;
  /** Shows watched to the last aired episode, and shows stopped. */
  finished: ReadonlySet<string>;
  watchlist: ReadonlySet<string>;
  /** On the Plex server, or streaming on a service the viewer pays for, as far as the daily job has looked. */
  available: ReadonlySet<string>;
  /** Picks turned down with "Not tonight". */
  rejected: ReadonlySet<string>;
};

export type Ranked = Candidate & {
  score: number;
  listed: boolean;
  /** On one of the viewer's services or the Plex server: the first thing the ranking sorts by. */
  available: boolean;
  /** Episodes seen, for a show begun and not finished. */
  partway: number | null;
};

/**
 * How much of the mood a title is, 0 to 1. Required genres are present by
 * construction and set the floor; what separates the pool is how many of the
 * preferred genres a title also carries.
 */
export function genreFit(item: Title, vibe: Vibe): number {
  const recipe = item.mediaType === "movie" ? vibe.movie : vibe.tv;
  const wanted = [...recipe.require, ...recipe.prefer];
  if (wanted.length === 0 || item.genreIds.length === 0) return 0.5;
  return wanted.filter((id) => item.genreIds.includes(id)).length / wanted.length;
}

/**
 * Fit leads, and by some distance: the viewer answered four questions to
 * describe an evening, so the thing they described should win. The audience
 * score says whether it is any good, TMDB's placing breaks ties towards what
 * is being watched, and the watchlist is the one bonus that is not a guess.
 */
export function fitScore(c: Candidate, vibe: Vibe, listed: boolean, partway: boolean): number {
  let score = genreFit(c.item, vibe) * 34;
  score += c.item.score * 0.38;
  score += Math.max(0, 1 - c.rank / 40) * 10;
  if (listed) score += 25;
  if (partway) score += 6;
  return score;
}

/**
 * Everything worth offering, best first. Seen is out: a film watched, a show
 * finished or stopped, and anything turned down tonight. A show with episodes
 * waiting stays, since carrying on is a fine answer to "what now".
 *
 * On your services comes first, before fit: a pick that needs a subscription
 * nobody in the house has is a pick nobody can play. Among titles equally
 * available, the fit score decides.
 */
export function rank(candidates: Iterable<Candidate>, vibe: Vibe, viewer: ViewerFacts): Ranked[] {
  const out: Ranked[] = [];
  for (const c of candidates) {
    if (viewer.rejected.has(c.key)) continue;
    if (c.item.mediaType === "movie" && viewer.watchedFilms.has(c.key)) continue;
    if (c.item.mediaType === "tv" && viewer.finished.has(c.key)) continue;
    const listed = viewer.watchlist.has(c.key);
    const partway = c.item.mediaType === "tv" ? (viewer.partway.get(c.key) ?? null) : null;
    out.push({
      ...c,
      listed,
      partway,
      available: c.restricted || viewer.available.has(c.key),
      score: fitScore(c, vibe, listed, partway !== null),
    });
  }
  return out.sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score);
}

/** A seeded shuffle, the first `n` of it. The same seed always gives the same order. */
export function shuffle<T>(items: readonly T[], seed: number, n = items.length): T[] {
  const copy = [...items];
  let state = seed >>> 0 || 1;
  // mulberry32: well spread from consecutive seeds, which a small LCG is not.
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** A fresh set every day without anybody asking for one. */
export function todaySeed(now = Date.now()) {
  return Math.floor(now / 86_400_000);
}

export type Chosen = { top: Ranked[]; wildcard: Ranked | null };

/**
 * Tonight's pick, the second and third choice, and the wildcard.
 *
 * The three come from what is being watched, shuffled within the strongest
 * handful: taking the top three outright was correct and useless, since the
 * same answers gave the same three films every night. Tonight's pick is
 * always one the viewer can play when any contender is, whatever the shuffle
 * says, and the other two follow the ranking's order.
 *
 * The wildcard is the best reviewed thing that matches, by audience score
 * rather than by the ranking: a different, deliberately unfashionable question
 * from "what is on". From the acclaimed pool, or from whatever is left when
 * that pool came back empty.
 */
export function choose(ranked: Ranked[], seed: number): Chosen {
  if (ranked.length === 0) return { top: [], wildcard: null };
  const popular = ranked.filter((r) => r.pools.has("popular"));
  const contenders = (popular.length >= 3 ? popular : ranked).slice(0, CONTENDERS);

  const playable = contenders.filter((c) => c.available);
  const first = shuffle(playable.length ? playable : contenders, seed, 1)[0];
  const rest = shuffle(
    contenders.filter((c) => c !== first),
    seed + 1,
    2,
  ).sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score);
  const top = [first, ...rest];

  const taken = new Set(top.map((t) => t.key));
  const left = ranked.filter((r) => !taken.has(r.key));
  const acclaimed = left.filter((r) => r.pools.has("acclaimed"));
  const wildcard = [...(acclaimed.length ? acclaimed : left)].sort((a, b) => b.item.score - a.item.score)[0] ?? null;
  return { top, wildcard };
}

// ---------------------------------------------------------------------------
// Why this one

/** A deterministic choice from the id, so a title reads the same way on every visit. */
function byId<T>(id: number, options: T[], shift: number): T {
  return options[Math.abs(Math.floor(id / 2 ** shift)) % options.length];
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function standingWord(score: number): string {
  if (score >= 85) return "adored";
  if (score >= 78) return "very well liked";
  if (score >= 70) return "well liked";
  if (score >= 62) return "solidly rated";
  return "divisive";
}

/** "horror", or "horror with a thriller edge" when there is a second genre. */
function genrePhrase(item: Title): string | null {
  const names = item.genreIds.map((id) => GENRE_NAMES[id]).filter((n): n is string => Boolean(n));
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  const [a, b] = names;
  return byId(item.id, [`${a} with a ${b} edge`, `${a} with a ${b} streak`, `${a} crossed with ${b}`, `${a} that is also ${b}`], 11);
}

/** What the title is, from its own genres, year and standing; any of the three may be missing. */
function character(item: Title): string {
  const genre = genrePhrase(item);
  const era = item.year ? `from ${item.year}` : null;
  const standing = item.score ? `${standingWord(item.score)} at ${item.score}%` : null;
  if (genre && era && standing) {
    return byId(
      item.id,
      [
        `A ${genre} ${era}, ${standing}.`,
        `${capitalise(genre)} ${era}. ${capitalise(standing)}.`,
        `${capitalise(standing)}, and ${genre} ${era}.`,
        `${capitalise(genre)} ${era}: ${standing}.`,
      ],
      6,
    );
  }
  if (genre && standing) return `A ${genre}, ${standing}.`;
  if (genre && era) return `A ${genre} ${era}.`;
  if (standing && era) return `${capitalise(standing)}, ${era}.`;
  if (genre) return `${capitalise(genre)}, through and through.`;
  return standing ? `${capitalise(standing)}.` : "";
}

export type ReasonExtras = {
  audience: Audience;
  vibe: Vibe;
  time: TimeChoice;
  runtime: number | null;
  /** The viewer's own services that stream it, by name. */
  services: string[];
  onPlex: boolean;
};

/**
 * Why this one, in three sentences at most: how it answers the question, what
 * the title is, and one fact about the viewer's own relation to it. The middle
 * sentence is the point: without it every card opened with the same words, and
 * boilerplate reads as a page that did not consider the title.
 */
export function reasonFor(entry: Ranked, x: ReasonExtras): string {
  const fit = genreFit(entry.item, x.vibe);
  const verb = byId(
    entry.item.id,
    fit >= 0.6
      ? ["lands square on", "goes straight for", "is aimed right at", "is built for"]
      : ["leans towards", "edges towards", "has a fair bit of", "brushes up against"],
    0,
  );
  const sentences = [`${x.audience.reasonLead}, and it ${verb} ${x.vibe.blurb}.`, character(entry.item)];
  const personal = closer(entry, x);
  if (personal) sentences.push(personal);
  return sentences.filter(Boolean).join(" ");
}

function closer(entry: Ranked, x: ReasonExtras): string | null {
  if (entry.partway !== null) {
    const n = entry.partway;
    const where = x.services.length ? ` and it is on ${x.services[0]}` : x.onPlex ? " and it is on Plex" : "";
    return `You are ${n} episode${n === 1 ? "" : "s"} in${where}.`;
  }
  if (entry.listed) return "You put this on your watchlist yourself.";
  if (x.services.length) return `Ready to play on ${x.services.slice(0, 2).join(" and ")}.`;
  if (x.onPlex) return "Ready to play on Plex.";
  if (entry.available) return "On one of your services right now.";
  if (x.runtime !== null) {
    const fits =
      entry.item.mediaType === "movie"
        ? x.time.maxRuntime === null || x.runtime <= x.time.maxRuntime
        : (x.time.maxEpisode === null || x.runtime <= x.time.maxEpisode) &&
          (x.time.minEpisode === null || x.runtime >= x.time.minEpisode);
    if (fits) return `It fits the ${x.time.phrase} you asked for.`;
  }
  if (!entry.pools.has("popular")) return "Not what is trending this week, which is rather the point.";
  return null;
}
