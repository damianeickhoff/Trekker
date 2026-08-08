import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { expandProviders, getUserProviders, KNOWN_PROVIDERS } from "./providers";
import { regionForUser } from "./region";
import { getWatchStatuses } from "./stats";
import { shuffle } from "./tonight";
import {
  catalogue,
  getRuntime,
  getWatchProviders,
  tmdbConfigured,
  type MediaType,
  type NormalisedItem,
} from "./tmdb";
import type { WatchStatus } from "@/components/media-card";
import type { Answers, Audience, Recipe, TimeChoice, Vibe } from "./what-to-watch-quiz";
import {
  findAudience,
  findKind,
  findTime,
  findVibe,
  GENRE_NAMES,
} from "./what-to-watch-quiz";

/**
 * "What to watch", answered.
 *
 * The four questions the wizard asks are turned into TMDB discover queries, and
 * everything that comes back is ranked against what the app already knows about
 * the viewer: what is on their watchlist, what they have already seen, and which
 * of the results one of their own subscriptions will actually play tonight.
 *
 * Two things here are worth knowing before changing anything.
 *
 * The first is that a mood is a *required* genre plus some preferred ones — see
 * `Recipe` in the quiz module. Everything used to be one OR-ed list, and "romantic
 * and warm" came back as The Shawshank Redemption, because Drama was in the list
 * and Drama matches half of cinema.
 *
 * The second is that there are two pools, not one. The popular pool is what
 * people are actually watching this week and supplies the three picks; the
 * acclaimed pool is sorted by score with a heavy vote floor and supplies the
 * wildcard. Ranking one merged list by quality alone is what made every answer
 * return the same handful of all-time greats regardless of the question.
 */

export type Pick = {
  item: NormalisedItem;
  /** 0-100. What the card shows next to its rank. */
  match: number;
  /** One or two sentences saying why this, in the viewer's own terms. */
  reason: string;
  /** Only looked up for the cards big enough to show it. */
  runtime: number | null;
  onWatchlist: boolean;
  /** One of the viewer's own services carries it right now. */
  streamingNow: boolean;
  /** Which service, when it was worth a call to find out. */
  services: string[];
  /** A show they have already started and have episodes waiting on. */
  partway: boolean;
};

export type Picks = {
  /** Tonight's pick, the second choice, the third. Fewer if that is all there is. */
  top: Pick[];
  /** The best-reviewed thing that matches, whether or not anyone is watching it. */
  wildcard: Pick | null;
  /** Everything else worth offering, behind "show other options". */
  others: Pick[];
  empty: boolean;
  /** The viewer has not told us what they subscribe to, so nothing is marked. */
  noProviders: boolean;
  /** What produced this set. "Show me another set" asks for the next one. */
  seed: number;
};

/** Which pools a candidate turned up in. */
type Pool = "popular" | "acclaimed";

/**
 * How the two pools are asked for.
 *
 * The acclaimed floor is deliberately brutal. `vote_average.desc` with a low
 * floor returns a wall of titles with forty votes and a perfect ten, and the
 * wildcard is the one card on the page claiming to be objectively good — it
 * cannot afford to be somebody's home movie.
 */
const POOLS: Record<Pool, { sort: string; votes: Record<MediaType, number> }> = {
  // The popular floor is not really about quality — `vote_average.gte` does
  // that — so much as about *churn*. Genres with a constant supply of cheap new
  // titles, horror above all, otherwise hand back a page of things released
  // last month with two hundred votes between them, and popularity alone
  // cannot tell those from the ones worth an evening.
  popular: { sort: "popularity.desc", votes: { movie: 400, tv: 60 } },
  acclaimed: { sort: "vote_average.desc", votes: { movie: 1000, tv: 200 } },
};

/** How many of the strongest candidates the three picks are drawn from. */
const CONTENDERS = 8;
const OTHERS = 9;

/**
 * Genres no mood here ever wants from television.
 *
 * "Switch off with something funny, short episodes" was returning The Late Show
 * and The Tonight Show — which are, to be fair, funny and short. They are also
 * not what anybody means, and no amount of genre scoring fixes a chat show
 * being a genuine Comedy on TMDB.
 */
const NEVER_TV = [10763, 10764, 10767]; // News, Reality, Talk

/**
 * Keywords for the corner of the catalogue that `include_adult=false` does not
 * reach. TMDB only flags outright pornography as adult, so a romance search on
 * popularity leaks softcore and an animation search leaks hentai — neither of
 * which is a thing to hand somebody who answered "Family".
 */
const NEVER_KEYWORDS = [198385, 190370, 155477]; // hentai, erotic movie, softcore

/**
 * How long a film has to have been out before it is offered, in days.
 *
 * `popularity.desc` is dominated by whatever is in cinemas this month, and
 * "tonight's pick" being a film you would have to buy a ticket for is not an
 * answer to the question. Six weeks is roughly the theatrical-to-digital
 * window, so this clears the titles nobody can watch at home without reaching
 * for TMDB's release-type filter — which only works when scoped to a region,
 * and scoping to a region makes TMDB return the *regional* release date, which
 * would have every card claiming Titanic came out in 2002.
 *
 * The provider-restricted query is exempt: a title on one of the viewer's own
 * services is provably playable tonight whatever its age, which is exactly how
 * a three-week-old streaming original still gets through.
 */
const CINEMA_WINDOW_DAYS = 45;

/** Below this the pool is too thin to rank, and the filters are loosened. */
const THIN = 8;

/** A fresh set every day without anybody having to ask for one. */
export function todaySeed() {
  return Math.floor(Date.now() / 86_400_000);
}

export async function findPicks(
  userId: string,
  answers: Answers,
  seed: number,
): Promise<Picks> {
  const audience = findAudience(answers.who);
  const vibe = findVibe(audience, answers.vibe);
  const kind = findKind(answers.kind);
  const time = findTime(kind?.value, answers.time);

  const nothing: Picks = {
    top: [],
    wildcard: null,
    others: [],
    empty: true,
    noProviders: false,
    seed,
  };

  if (!audience || !vibe || !kind || !time || !tmdbConfigured()) return nothing;

  const [subscribed, watchlist, statuses, region] = await Promise.all([
    getUserProviders(userId),
    db.watchlistItem.findMany({
      where: { userId },
      select: { mediaType: true, tmdbId: true },
    }),
    getWatchStatuses(userId).catch(() => new Map<string, WatchStatus>()),
    regionForUser(userId),
  ]);

  const onWatchlist = new Set(
    watchlist.map((row) => `${row.mediaType === "tv" ? "tv" : "movie"}-${row.tmdbId}`),
  );
  const providerIds = [...expandProviders(subscribed)];

  const wanted: MediaType[] =
    kind.value === "both" ? ["movie", "tv"] : [kind.value === "tv" ? "tv" : "movie"];

  const query = { wanted, audience, vibe, time, providerIds, region };

  let pool = await gather({ ...query, loose: false });

  // A required genre on a short evening can genuinely come back with four
  // things. Rather than show four, ask again with the length, the era and the
  // quality floor dropped — the required genre stays, because without it the
  // answer stops being an answer to the question that was asked.
  if (pool.items.size < THIN) {
    pool = mergePools(pool, await gather({ ...query, loose: true }));
  }

  const ranked = [...pool.items.values()]
    .filter((entry) => {
      const status = statuses.get(entry.key);
      // Something finished is not an answer to "what shall we watch tonight".
      // A show with episodes waiting very much is, so only `continue` survives.
      return status === undefined || status === "continue";
    })
    .map((entry) => {
      const listed = onWatchlist.has(entry.key);
      const streaming = pool.streamingNow.has(entry.key);
      const partway = statuses.get(entry.key) === "continue";

      return {
        ...entry,
        listed,
        streaming,
        partway,
        score: scoreOf({ item: entry.item, vibe, rank: entry.rank, listed, streaming, partway }),
      };
    })
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return { ...nothing, noProviders: subscribed.length === 0 };
  }

  /*
   * The three picks come from what is actually being watched, shuffled within
   * the strongest handful. Taking the top three outright was correct and
   * useless: the same answers handed back the same three films every night, and
   * a page you can predict is a page you stop opening.
   */
  const popular = ranked.filter((entry) => entry.pools.has("popular"));
  const contenders = (popular.length >= 3 ? popular : ranked).slice(0, CONTENDERS);
  const top = shuffle(contenders, seed, 3).sort((a, b) => b.score - a.score);

  const taken = new Set(top.map((entry) => entry.key));

  // The wildcard is chosen by audience score rather than by our own ranking:
  // its whole job is to be the best-reviewed thing that fits, which is a
  // different and deliberately unfashionable question from "what is on".
  const acclaimed = ranked
    .filter((entry) => entry.pools.has("acclaimed") && !taken.has(entry.key))
    .sort((a, b) => b.item.score - a.item.score)
    // Six, not five, and not arbitrarily. `shuffle` is an LCG whose multiplier
    // is 1664525 = 5² × 66581, so consecutive seeds advance its state by a
    // multiple of five — and picking one item out of five therefore returned
    // the *same* item every day, however far the seed moved. Six is coprime to
    // the stride and rotates properly. Anything divisible by five here silently
    // stops the wildcard being a wildcard.
    .slice(0, 6);
  const wildcard = shuffle(acclaimed, seed, 1)[0] ?? null;
  if (wildcard) taken.add(wildcard.key);

  const rest = ranked.filter((entry) => !taken.has(entry.key)).slice(0, OTHERS);

  // Only the big cards are worth the extra round trips: they show a length and
  // name the service, and the small cards behind "show other options" show
  // neither. Both lookups are cached hard by the TMDB layer, so asking the same
  // question twice costs nothing the second time.
  const detailed = await mapLimit(
    wildcard ? [...top, wildcard] : top,
    4,
    async (entry) => {
      const [runtime, offers] = await Promise.all([
        getRuntime(entry.item.mediaType, entry.item.id).catch(() => null),
        providerIds.length > 0
          ? getWatchProviders(entry.item.mediaType, entry.item.id, region).catch(() => null)
          : Promise.resolve(null),
      ]);

      const services = namesFor(offers?.stream ?? [], subscribed);

      return toPick(entry, {
        audience,
        vibe,
        time,
        runtime,
        services,
        // The listing itself is the better answer than the provider-restricted
        // search was: that only proved the title is on *somebody's* catalogue
        // in this region, whereas this names the services and can disagree.
        streamingNow: offers ? services.length > 0 : entry.streaming,
      });
    },
  );

  return {
    top: detailed.slice(0, top.length),
    wildcard: wildcard ? (detailed[detailed.length - 1] ?? null) : null,
    others: rest.map((entry) =>
      toPick(entry, {
        audience,
        vibe,
        time,
        runtime: null,
        services: [],
        streamingNow: entry.streaming,
      }),
    ),
    empty: false,
    noProviders: subscribed.length === 0,
    seed,
  };
}

/* ==========================================================================
 * Asking TMDB
 * ======================================================================== */

type Candidate = {
  key: string;
  item: NormalisedItem;
  /** Which pools it turned up in — the wildcard is drawn from one of them. */
  pools: Set<Pool>;
  /** The best placing TMDB gave it, as a popularity prior. */
  rank: number;
};

type Gathered = {
  items: Map<string, Candidate>;
  /** Keys that one of the viewer's own services carries right now. */
  streamingNow: Set<string>;
};

function mergePools(a: Gathered, b: Gathered): Gathered {
  const items = new Map(b.items);
  // `a` came from the stricter query, so where both have a title `a` wins: its
  // placing was earned against the filters the viewer actually asked for.
  for (const [key, candidate] of a.items) items.set(key, candidate);

  return { items, streamingNow: new Set([...a.streamingNow, ...b.streamingNow]) };
}

async function gather({
  wanted,
  audience,
  vibe,
  time,
  providerIds,
  region,
  loose,
}: {
  wanted: MediaType[];
  audience: Audience;
  vibe: Vibe;
  time: TimeChoice;
  providerIds: number[];
  region: string;
  /** Drops the length limit, the era and the quality floor. Never the genre. */
  loose: boolean;
}): Promise<Gathered> {
  type Request = { pool: Pool; restricted: boolean; kind: MediaType; page: number };

  const requests: Request[] = [];

  for (const kind of wanted) {
    // Two pages of what is popular, one of what is best reviewed, and one of
    // the popular search narrowed to what the viewer can actually play. That
    // last one doubles as the answer to "can I watch this tonight?" — a
    // per-title availability call for forty candidates would be forty round
    // trips for a badge.
    requests.push({ pool: "popular", restricted: false, kind, page: 1 });
    requests.push({ pool: "popular", restricted: false, kind, page: 2 });
    requests.push({ pool: "acclaimed", restricted: false, kind, page: 1 });
    if (providerIds.length > 0) {
      requests.push({ pool: "popular", restricted: true, kind, page: 1 });
    }
  }

  const results = await Promise.all(
    requests.map(async (request) => ({
      request,
      data: await catalogue(
        discoverPath({
          kind: request.kind,
          pool: request.pool,
          audience,
          vibe,
          time,
          loose,
          providers: request.restricted ? providerIds : [],
          region,
        }),
        request.kind,
        request.page,
      ).catch(() => null),
    })),
  );

  const items = new Map<string, Candidate>();
  const streamingNow = new Set<string>();

  for (const { request, data } of results) {
    if (!data) continue;

    data.items.forEach((item, index) => {
      const key = `${item.mediaType}-${item.id}`;
      if (request.restricted) streamingNow.add(key);

      // Where TMDB ranked it, counting from the top of page one. Only the
      // popular pool contributes a placing — a title's position in a list
      // sorted by score says nothing about whether anyone is watching it.
      const placing =
        request.pool === "popular" ? (data.page - 1) * 20 + index : Number.MAX_SAFE_INTEGER;

      const existing = items.get(key);
      if (existing) {
        existing.pools.add(request.pool);
        existing.rank = Math.min(existing.rank, placing);
      } else {
        items.set(key, { key, item, pools: new Set([request.pool]), rank: placing });
      }
    });
  }

  return { items, streamingNow };
}

function discoverPath({
  kind,
  pool,
  audience,
  vibe,
  time,
  loose,
  providers,
  region,
}: {
  kind: MediaType;
  pool: Pool;
  audience: Audience;
  vibe: Vibe;
  time: TimeChoice;
  loose: boolean;
  providers: number[];
  region: string;
}): string {
  const params = new URLSearchParams();
  const recipe: Recipe = kind === "movie" ? vibe.movie : vibe.tv;
  const isMovie = kind === "movie";

  params.set("sort_by", POOLS[pool].sort);

  // Commas are an AND and pipes are an OR. The required genres are AND-ed,
  // because a title without them is not the mood that was asked for; the
  // preferred ones are not in the query at all and are scored instead.
  const keywords = recipe.keywords ?? [];
  if (keywords.length > 0) params.set("with_keywords", keywords.join("|"));

  if (recipe.require.length > 0) {
    params.set("with_genres", recipe.require.join(","));
  } else if (recipe.prefer.length > 0 && keywords.length === 0) {
    // Only worth falling back to a broad OR of the preferred genres when
    // nothing else narrows the query. A keyword already has, and stacking an
    // OR-ed genre list on top of it would throw away most of what it found.
    params.set("with_genres", recipe.prefer.join("|"));
  }

  const without = [
    ...((isMovie ? audience.withoutMovieGenres : audience.withoutTvGenres) ?? []),
    ...(isMovie ? [] : NEVER_TV),
  ];
  if (without.length > 0) params.set("without_genres", without.join(","));

  params.set("include_adult", "false");
  params.set("without_keywords", NEVER_KEYWORDS.join(","));

  params.set("vote_count.gte", String(loose ? 20 : POOLS[pool].votes[kind]));
  if (pool === "popular" && !loose) params.set("vote_average.gte", "6.3");

  if (vibe.language) params.set("with_original_language", vibe.language);

  const dateField = isMovie ? "primary_release_date" : "first_air_date";

  /*
   * Nothing that is not out yet, and for films nothing still only in cinemas.
   *
   * Survives the loose retry along with the required genre: offering something
   * the viewer cannot actually put on tonight is not a near miss, it is a wrong
   * answer, and no amount of thin results makes it a better one.
   */
  const today = new Date().toISOString().slice(0, 10);
  const watchable =
    isMovie && providers.length === 0
      ? new Date(Date.now() - CINEMA_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
      : today;

  const era = vibe.to ? `${vibe.to}-12-31` : watchable;
  params.set(`${dateField}.lte`, era < watchable ? era : watchable);

  if (!loose) {
    if (vibe.from) params.set(`${dateField}.gte`, `${vibe.from}-01-01`);

    // TMDB reads `with_runtime` as the *episode* length for a series, which is
    // a different question from "how long have I got" — which is exactly why
    // the last question asks shows about episode shape instead. See the quiz
    // module's comment on `TimeChoice`.
    if (isMovie) {
      if (time.maxRuntime !== null) params.set("with_runtime.lte", String(time.maxRuntime));
    } else {
      if (time.maxEpisode !== null) params.set("with_runtime.lte", String(time.maxEpisode));
      if (time.minEpisode !== null) params.set("with_runtime.gte", String(time.minEpisode));
    }
  }

  if (providers.length > 0) {
    params.set("with_watch_providers", providers.join("|"));
    params.set("watch_region", region);
  }

  return `/discover/${kind}?${params.toString()}`;
}

/* ==========================================================================
 * Ranking
 * ======================================================================== */

function scoreOf({
  item,
  vibe,
  rank,
  listed,
  streaming,
  partway,
}: {
  item: NormalisedItem;
  vibe: Vibe;
  rank: number;
  listed: boolean;
  streaming: boolean;
  partway: boolean;
}): number {
  /*
   * Fit leads, and by some distance.
   *
   * The first version of this weighted the audience score at 0.5 and genre fit
   * at 18, which meant a beloved film that only glanced off the mood beat a
   * good one that *was* the mood by eleven points. Since the viewer answered
   * four questions to describe an evening, the thing they described should win.
   */
  let score = genreFit(item, vibe) * 34;

  // Still the only term that says whether the title is any good, as opposed to
  // whether it fits — just no longer able to override the question.
  score += item.score * 0.38;

  // Where TMDB put it, which within a single genre is mostly a measure of how
  // recently it came out. Enough to break a tie between two equally fitting
  // titles, deliberately not enough to put this month's release above a better
  // film from last year.
  score += Math.max(0, 1 - rank / 40) * 10;

  // The one bonus that is not a guess: something on the watchlist is something
  // the viewer has already decided they want, which beats anything TMDB thinks.
  if (listed) score += 25;

  if (streaming) score += 10;
  if (partway) score += 6;

  return score;
}

/**
 * How much of the asked-for mood a title actually is, 0 to 1.
 *
 * Required genres count towards it as well as preferred ones. They are all
 * present by construction, so they set the floor rather than separating
 * anything — what actually sorts the pool is how many of the *preferred*
 * genres a title also carries.
 */
function genreFit(item: NormalisedItem, vibe: Vibe): number {
  const recipe = item.mediaType === "movie" ? vibe.movie : vibe.tv;
  const wanted = [...recipe.require, ...recipe.prefer];
  const ids = item.genreIds ?? [];

  if (wanted.length === 0 || ids.length === 0) return 0.5;

  return wanted.filter((id) => ids.includes(id)).length / wanted.length;
}

type Entry = {
  key: string;
  item: NormalisedItem;
  score: number;
  listed: boolean;
  streaming: boolean;
  partway: boolean;
  pools: Set<Pool>;
};

type Trimmings = {
  audience: Audience;
  vibe: Vibe;
  time: TimeChoice;
  runtime: number | null;
  services: string[];
  streamingNow: boolean;
};

function toPick(entry: Entry, extra: Trimmings): Pick {
  return {
    item: entry.item,
    // The raw score runs past 100 when everything lines up at once, and a "112%
    // match" reads as a bug. Floored as well as capped: nothing that survived
    // the filters is a 20% answer, and saying so undersells the whole page.
    match: Math.max(45, Math.min(99, Math.round(entry.score))),
    reason: reasonFor(entry, extra),
    runtime: extra.runtime,
    onWatchlist: entry.listed,
    streamingNow: extra.streamingNow,
    services: extra.services,
    partway: entry.partway,
  };
}

/**
 * Why this one, in the viewer's own words.
 *
 * Three sentences: how it answers the question, what the thing actually *is*,
 * and at most one fact about the viewer's own relationship to it.
 *
 * The middle sentence is the whole point. An earlier version was just the first
 * and third, which meant every card on the page opened with the same words —
 * four picks all saying "For date night, and it lands square on romance" reads
 * as boilerplate, and boilerplate is worse than saying nothing, because it
 * looks like the page did not actually consider the title. So the middle
 * sentence is built from the title's own genres, year and score, and the
 * phrasing around it is varied by id.
 *
 * Varied by *id* rather than at random, so a given film reads the same way on
 * every visit. Wording that reshuffles itself on refresh is unsettling in a way
 * that is hard to name and easy to notice.
 */
function reasonFor(
  entry: Entry,
  { audience, vibe, time, runtime, services, streamingNow }: Trimmings,
): string {
  const { item } = entry;
  const fit = genreFit(item, vibe);

  // Different bits of the id for each choice, or the two would move together
  // and the page would only ever show four of the twelve combinations.
  const pick = <T,>(options: T[], shift: number): T =>
    options[Math.abs(Math.floor(item.id / 2 ** shift)) % options.length];

  // One shape, two sets of verbs. The blurbs carry commas of their own
  // ("romance, and warmth with it"), so anything that continues *after* them
  // falls apart — "there is enough of romance, and warmth with it in it" was
  // the first attempt. Keeping the blurb at the end of the sentence is what
  // makes every combination read.
  const verb = pick(
    fit >= 0.6
      ? ["lands square on", "goes straight for", "is aimed right at", "is built for"]
      : ["leans towards", "edges towards", "has a fair bit of", "brushes up against"],
    0,
  );

  const opening = `${audience.reasonLead}, and it ${verb} ${vibe.blurb}.`;

  const sentences = [opening, character(item, pick)].filter(Boolean) as string[];

  const personal = closer(entry, { time, runtime, services, streamingNow });
  if (personal) sentences.push(personal);

  return sentences.join(" ");
}

/**
 * What the title actually is — genre, age, standing — in one line.
 *
 * Built from fragments rather than a fixed template because any of them can be
 * missing: TMDB list results carry no genre ids for some titles, a few have no
 * release date, and anything unrated has a score of zero that it would be a lie
 * to print.
 */
function character(item: NormalisedItem, pick: <T>(options: T[], shift: number) => T): string {
  const genre = genrePhrase(item, pick);
  const era = item.year ? `from ${item.year}` : null;
  const standing = item.score ? `${standingWord(item.score)} at ${item.score}%` : null;

  if (genre && era && standing) {
    return pick(
      [
        `A ${genre} ${era}, ${standing}.`,
        `${capitalise(genre)} ${era}. ${capitalise(standing)}.`,
        `${capitalise(standing)}, and ${genre} ${era}.`,
        `${capitalise(genre)} ${era} — ${standing}.`,
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

/** "horror", or "horror with a thriller edge" when there is a second one. */
function genrePhrase(
  item: NormalisedItem,
  pick: <T>(options: T[], shift: number) => T,
): string | null {
  const names = (item.genreIds ?? [])
    .map((id) => GENRE_NAMES[id])
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];

  const [first, second] = names;
  return pick(
    [
      `${first} with a ${second} edge`,
      `${first} with a ${second} streak`,
      `${first} crossed with ${second}`,
      `${first} that is also ${second}`,
    ],
    11,
  );
}

function standingWord(score: number): string {
  if (score >= 85) return "adored";
  if (score >= 78) return "very well liked";
  if (score >= 70) return "well liked";
  if (score >= 62) return "solidly rated";
  return "divisive";
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The one personal note, if there is one worth making.
 *
 * Capped at a single sentence because the chips above already say "on your
 * watchlist" and "available now" in three words each — repeating both in prose
 * is padding, and this is the line people actually read.
 */
function closer(
  entry: Entry,
  // Spelled out rather than picked off `Trimmings`: this module exports a type
  // of its own called `Pick`, which shadows the built-in utility type.
  {
    time,
    runtime,
    services,
    streamingNow,
  }: {
    time: TimeChoice;
    runtime: number | null;
    services: string[];
    streamingNow: boolean;
  },
): string | null {
  if (entry.listed) return "You put this on your watchlist yourself.";
  if (entry.partway) return "You are partway through it already.";

  if (services.length > 0) return `Ready to play on ${services.join(" and ")}.`;
  if (streamingNow) return "On one of your services right now.";

  if (runtime !== null) {
    const fits =
      entry.item.mediaType === "movie"
        ? time.maxRuntime === null || runtime <= time.maxRuntime
        : (time.maxEpisode === null || runtime <= time.maxEpisode) &&
          (time.minEpisode === null || runtime >= time.minEpisode);

    if (fits) return `It fits the ${time.phrase} you asked for.`;
  }

  // Nothing personal to say, but the wildcard has something of its own: it was
  // chosen for being well reviewed rather than for being on, and saying so is
  // more use than saying nothing.
  if (!entry.pools.has("popular")) {
    return "Not what is trending this week, which is rather the point.";
  }

  return null;
}

/**
 * Provider ids back to the handful of names worth showing. Same trick as
 * `tonight.ts`: TMDB lists "Netflix basic with Ads" separately, and nobody
 * wants to be told that — they want to be told "Netflix".
 */
function namesFor(offers: { provider_id: number }[], subscribed: number[]): string[] {
  const nameFor = new Map<number, string>();
  for (const provider of KNOWN_PROVIDERS) {
    if (!subscribed.includes(provider.id)) continue;
    for (const id of provider.ids) nameFor.set(id, provider.name);
  }

  return [
    ...new Set(
      offers
        .map((offer) => nameFor.get(offer.provider_id))
        .filter((name): name is string => name !== undefined),
    ),
  ].slice(0, 2);
}
