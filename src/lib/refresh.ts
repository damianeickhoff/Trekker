import "server-only";
import { autoRequestNew, type NewOnList } from "./auto-request";
import { availabilitySources, refreshAvailability, regionsInUse, titlesToCheck, type TitleRef } from "./availability";
import { mapLimit } from "./concurrency";
import { addDays, todayKey } from "./dates";
import { db } from "./db";
import { followedPersonIds, recordPersonNews, unseededPersonIds } from "./follow";
import { filmNews, record, showNews } from "./news";
import { gate } from "./gates";
import { pressPassAt, prunePress, runPressPass } from "./press";
import { setUnknownShowHook } from "./plays";
import { plexSyncAccounts, syncPlexHistory } from "./plex-history";
import { RefreshQueue } from "./queue";
import { episodeLength, filmLength } from "./runtime";
import { rebuildSmartList, topUpListRuntimes } from "./smart-lists";
import type { Found } from "./smart-query";
import { airedFacts, recomputeFollowers, recomputeTitleState, storeShowEpisodes } from "./title-state";
import {
  getMovieDetails,
  getPerson,
  getReleaseDates,
  getSeason,
  getTvDetails,
  getWatchProviders,
  movieDetailsKey,
  offersFor,
  releaseDatesFor,
  tmdbConfigured,
  tmdbPeek,
  tvDetailsKey,
  type MovieDetails,
  type TvDetails,
} from "./tmdb";

/**
 * The refresh job: the only place TMDB, Plex and Overseerr are called outside
 * a title page and the two things a person is waiting on by asking (the smart
 * list editor's preview, a list's Add titles search). Everything a list screen shows is written here ahead of time,
 * so no screen waits on the network for something it could have stored. The
 * news feeds (`lib/press.ts`) are read from here too, and nowhere else.
 *
 * Triggers:
 * - every six hours, returning shows are re-fetched (`runReturningPass`);
 * - daily at 04:00, smart lists, availability, auto-request, watchlist enrichment,
 *   followed people's new work, the news feeds and housekeeping (`runDailyPass`);
 * - once after start-up, followed people with no news yet are seeded, and the
 *   news feeds are read if nothing from them is stored;
 * - on saving a smart list, that one list (`scheduleSmartBuild`);
 * - on first visit after an import, the backfill (`ensureBackfill`);
 * - on a viewing of a show never fetched, that one show (`scheduleShow`);
 * - every half hour, each Plex account's history into their plays
 *   (`runPlexHistoryPass`);
 * - on an Overseerr webhook or a newly linked server, availability for one
 *   title or for everything (`scheduleAvailability`, `scheduleAvailabilitySweep`);
 * - on an import, its TMDB lookups (`lib/trakt-import.ts`).
 *
 * `instrumentation.ts` starts the timers in production; `/api/cron` runs the
 * same jobs for hosts that prefer an external scheduler.
 */

const CONCURRENCY = 4;

type Globals = {
  trekkerQueue?: RefreshQueue;
  trekkerBackfills?: Map<string, Promise<void>>;
  trekkerScheduler?: boolean;
  trekkerNewsReads?: Map<"press" | "people", number>;
};
const g = globalThis as unknown as Globals;

/** One queue per process, surviving dev-server reloads like the Prisma client. */
export const queue = (g.trekkerQueue ??= new RefreshQueue({ concurrency: CONCURRENCY, gate }));

/** Backfills running in this process, by user id. */
const backfills = (g.trekkerBackfills ??= new Map<string, Promise<void>>());

// ---------------------------------------------------------------------------
// One show

/**
 * Re-fetches one show and brings every follower's `TitleState` up to date.
 *
 * `force` is the six-hourly pass: details and the seasons that can still change
 * (the one airing now and the next) are asked for again, whatever the cache
 * says. Without it, everything comes from the cache when fresh, which is what
 * makes a backfill after a restart nearly free. Seasons the cache has never
 * held are always fetched, since an episode list with holes gives a wrong
 * "next episode".
 *
 * Deduped by show in the queue: the backfill and the pass asking for the same
 * show at once fetch it once. Returns false when TMDB could not answer.
 */
export function refreshShow(showId: number, options: { force?: boolean; alsoFor?: string[] } = {}) {
  return queue.enqueue(`show:${showId}`, async () => {
    // What the cache held before this fetch, for the news: the comparison happens as the newer answer is written.
    const key = tvDetailsKey(showId);
    const before = options.force ? await tmdbPeek<TvDetails>(key.path, key.params).catch(() => null) : null;
    const details = await getTvDetails(showId, { force: options.force }).catch(() => null);
    if (details && before) await record(showNews(before, details, todayKey())).catch(() => 0);
    if (!details) {
      // Still give the people asking a row with their watched half, so the
      // backfill finishes and the show is not simply missing.
      for (const userId of options.alsoFor ?? []) await recomputeTitleState(db, userId, showId);
      return false;
    }

    const live = new Set(
      [details.last_episode_to_air?.season_number, details.next_episode_to_air?.season_number].filter(
        (n): n is number => typeof n === "number" && n > 0,
      ),
    );
    const numbered = details.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);

    // Sequential within a show: the gate spaces the calls anyway, and four
    // shows at a time is the concurrency the queue promises.
    for (const season of numbered) {
      await getSeason(showId, season.season_number, {
        force: options.force && live.has(season.season_number),
      }).catch(() => null);
    }

    const stored: TvDetails | null = await storeShowEpisodes(showId);
    await recomputeFollowers(showId, stored ? airedFacts(stored) : null, options.alsoFor);
    return true;
  });
}

/** Fire-and-forget for a viewing of a show the job has never fetched. */
export function scheduleShow(showId: number) {
  if (!tmdbConfigured()) return;
  refreshShow(showId).catch((error) => console.error(`refresh of show ${showId} failed`, error));
}

// `plays.ts` stays free of the network by being told about this, not importing it.
setUnknownShowHook(scheduleShow);

// ---------------------------------------------------------------------------
// The six-hourly pass

/**
 * Every show that can still change, re-fetched, and every saved film still
 * news-worthy, for the news they carry. Ended and cancelled shows wait for
 * nothing.
 */
export async function runReturningPass() {
  if (!tmdbConfigured()) return { shows: 0, ok: 0, films: 0 };
  const rows = await db.titleState.findMany({
    where: { status: { in: ["returning", "upcoming"] } },
    select: { showId: true },
    distinct: ["showId"],
  });
  const results = await mapLimit(rows, CONCURRENCY, (r) => refreshShow(r.showId, { force: true }).catch(() => false));
  const films = await checkSavedFilms();
  return { shows: rows.length, ok: results.filter(Boolean).length, films: films.films };
}

/** A saved film stops being checked for news this long after it came out. */
const FILM_NEWS_DAYS = 60;

/**
 * Saved films whose release date or trailers could still be news: undated,
 * coming, or out within the last two months. One forced details call each
 * (the trailers are in it), through the gate, once per film however many
 * people saved it; the answer the cache held before is what it is set
 * against, as a show's is.
 */
export async function checkSavedFilms(today = todayKey()) {
  if (!tmdbConfigured()) return { films: 0, news: 0 };
  const saved = await db.watchlistItem.findMany({
    where: { mediaType: "movie", OR: [{ releaseDate: null }, { releaseDate: { gte: addDays(today, -FILM_NEWS_DAYS) } }] },
    select: { tmdbId: true },
    distinct: ["tmdbId"],
  });
  const found = await mapLimit(saved, CONCURRENCY, (row) =>
    queue
      .enqueue(`film-news:${row.tmdbId}`, async () => {
        const key = movieDetailsKey(row.tmdbId);
        const before = await tmdbPeek<MovieDetails>(key.path, key.params).catch(() => null);
        const after = await getMovieDetails(row.tmdbId, { force: true }).catch(() => null);
        return after && before ? record(filmNews(before, after, today)) : 0;
      })
      .catch(() => 0),
  );
  return { films: saved.length, news: found.reduce((sum, n) => sum + n, 0) };
}

// ---------------------------------------------------------------------------
// The daily pass

/** Streaming catalogues move; a week-old answer is close enough for a watchlist row. */
export const ENRICH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** Rows looked up per pass. A long watchlist fills in over a few days rather than in one burst. */
export const ENRICH_PER_RUN = 24;

/**
 * Which rows are due: never looked at, or looked at over a week ago. Only the
 * stamp decides. The previous app also counted a null runtime as due, and a
 * title TMDB has no length for stayed due forever, asked about on every pass;
 * here a lookup that finds no length is stamped like one that does, and waits
 * its week like any other.
 */
export function enrichmentDue(now = Date.now()) {
  return { OR: [{ enrichedAt: null }, { enrichedAt: { lt: new Date(now - ENRICH_AFTER_MS) } }] };
}

/**
 * Length and streaming services on watchlist rows, so the watchlist can be
 * sorted and filtered without asking TMDB. Twenty-four rows a pass, never
 * looked at first and then the oldest. A show's length is one episode's.
 */
export async function enrichWatchlist(limit = ENRICH_PER_RUN) {
  if (!tmdbConfigured()) return { rows: 0 };
  const rows = await db.watchlistItem.findMany({
    where: enrichmentDue(),
    // SQLite sorts nulls first ascending: never-looked-at rows lead.
    orderBy: { enrichedAt: "asc" },
    take: limit,
    select: { id: true, mediaType: true, tmdbId: true, runtime: true, user: { select: { region: true } } },
  });
  const [fallback] = await regionsInUse();

  await mapLimit(rows, CONCURRENCY, (row) =>
    queue.enqueue(`enrich:${row.id}`, async () => {
      const mediaType = row.mediaType === "tv" ? "tv" : "movie";
      const [details, all] = await Promise.all([
        mediaType === "movie" ? getMovieDetails(row.tmdbId).catch(() => null) : getTvDetails(row.tmdbId).catch(() => null),
        getWatchProviders(mediaType, row.tmdbId).catch(() => null),
      ]);
      const length = details ? (mediaType === "movie" ? filmLength(details as MovieDetails) : episodeLength(details as TvDetails)) : null;
      const region = row.user.region?.trim().toUpperCase() || fallback;
      const stream = offersFor(all, region)?.stream ?? [];
      await db.watchlistItem
        .update({
          where: { id: row.id },
          data: {
            // A failed lookup keeps the last answer rather than forgetting it.
            runtime: length ?? row.runtime,
            ...(all
              ? {
                  streaming: stream.map((p) => p.provider_name).join(","),
                  streamingIds: stream.map((p) => p.provider_id).join(","),
                }
              : {}),
            enrichedAt: new Date(),
          },
        })
        // Removed from the watchlist while we were looking; nothing to write.
        .catch(() => undefined);
    }),
  );
  return { rows: rows.length };
}

// ---------------------------------------------------------------------------
// Smart lists

/**
 * One smart list rebuilt, through the queue so a Save pressed twice, or a Save
 * during the daily pass, builds it once.
 */
export function scheduleSmartBuild(listId: string) {
  return queue.enqueue(`smart:${listId}`, () => rebuildSmartList(listId));
}

/**
 * Every smart list, one at a time: each is already several TMDB requests
 * deep, and thirty at once is how a key gets rate limited into empty lists.
 * Oldest first, so a list an outage skipped yesterday goes first today.
 *
 * `fresh` is what each auto-requesting list found new, for the daily pass to
 * file once availability has been swept. A build shared with a Save pressed
 * at the same moment finds nothing new, which is right: that build is drawing
 * the edited question's first line.
 */
export async function rebuildSmartLists() {
  if (!tmdbConfigured()) return { lists: 0, ok: 0, fresh: [] as NewOnList[] };
  const lists = await db.mediaList.findMany({
    where: { kind: "smart" },
    orderBy: { refreshedAt: "asc" },
    select: { id: true, autoRequest: true },
  });
  const results = await mapLimit(lists, 1, (l) =>
    scheduleSmartBuild(l.id).catch(() => ({ count: 0, ok: false, added: [] as Found[] })),
  );
  const runtimes = await topUpListRuntimes((key, task) => queue.enqueue(key, task));
  const fresh = lists
    .map((l, i) => ({ listId: l.id, on: l.autoRequest, added: results[i].added }))
    .filter((l) => l.on && l.added.length > 0)
    .map((l) => ({ listId: l.listId, titles: l.added.map((t) => ({ mediaType: t.mediaType, tmdbId: t.id })) }));
  return { lists: lists.length, ok: results.filter((r) => r.ok).length, runtimes, fresh };
}

/**
 * When each watchlisted film reaches cinemas and streaming, written onto the
 * watchlist row so the calendar and Landing soon read a column, not TMDB.
 *
 * Read through the cache: details and release dates keep a week, so a daily
 * look costs a network call per film per week at most. A film out both ways
 * (or released over a year ago, whose digital date nobody is waiting for) is
 * settled and looked at monthly. Region is the row owner's, as for streaming.
 */
export async function refreshReleaseDates(today = todayKey()) {
  if (!tmdbConfigured()) return { rows: 0 };
  const rows = await db.watchlistItem.findMany({
    where: { mediaType: "movie" },
    select: {
      id: true,
      tmdbId: true,
      releaseDate: true,
      streamingDate: true,
      releaseCheckedAt: true,
      user: { select: { region: true } },
    },
  });
  const [fallback] = await regionsInUse();
  const yearAgo = addDays(today, -365);
  const now = Date.now();
  const due = rows.filter((row) => {
    if (!row.releaseCheckedAt) return true;
    const out = (d: string | null) => d !== null && d < today;
    const settled =
      (out(row.releaseDate) && out(row.streamingDate)) || (row.releaseDate !== null && row.releaseDate < yearAgo);
    // An hour's slack, so a pass that runs a little early still counts a day.
    return now - row.releaseCheckedAt.getTime() >= (settled ? 30 * DAY_MS : DAY_MS - 60 * 60 * 1000);
  });

  await mapLimit(due, CONCURRENCY, (row) =>
    queue.enqueue(`release:${row.id}`, async () => {
      const details = await getMovieDetails(row.tmdbId).catch(() => null);
      const primary = details?.release_date || null;
      // Nobody is waiting on the digital date of a film from years ago.
      const recent = !primary || primary >= yearAgo;
      const answer = recent ? await getReleaseDates(row.tmdbId).catch(() => null) : null;
      // Neither answer came: leave the last good dates alone and try tomorrow.
      if (!details && !answer) return;
      const region = row.user.region?.trim().toUpperCase() || fallback;
      const dates = releaseDatesFor(answer, region, primary);
      await db.watchlistItem
        .update({ where: { id: row.id }, data: { ...dates, releaseCheckedAt: new Date() } })
        .catch(() => undefined);
    }),
  );
  return { rows: due.length };
}

/** How many dismissed-notification rows each person keeps. */
const NOTIFICATION_READ_CAP = 200;

/**
 * `NotificationRead` only ever grows. The newest 200 per person are all the
 * bell can show, so the rest go. One statement over the `(userId, readAt)` index.
 */
export async function capNotificationReads() {
  return db.$executeRaw`
    DELETE FROM "NotificationRead" WHERE "id" IN (
      SELECT "id" FROM (
        SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "readAt" DESC) AS n
        FROM "NotificationRead"
      ) WHERE n > ${NOTIFICATION_READ_CAP}
    )`;
}

/**
 * Entries long past their lifetime and not worth serving stale any more.
 * Thirty days past expiry: long enough to ride out any TMDB outage.
 */
export async function pruneTmdbCache() {
  const { count } = await db.tmdbCache.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
  return count;
}

/**
 * Followed people: each one's credits through the cached person endpoint (a
 * week's lifetime, so at most one request per person per week), set against
 * the last look, with what is new stored as `NewsItem` rows. Once per person
 * however many follow them; a person TMDB cannot answer for waits a day.
 * Someone followed before first looks seeded news, and who has none, is
 * seeded on the way (`unseededPersonIds`). `only` narrows the look to those ids.
 */
export async function checkFollowedPeople(today = todayKey(), { only }: { only?: number[] } = {}) {
  if (!tmdbConfigured()) return { people: 0, news: 0 };
  const [ids, unseeded] = await Promise.all([only ?? followedPersonIds(), unseededPersonIds()]);
  const seed = new Set(unseeded);
  const found = await mapLimit(ids, CONCURRENCY, (id) =>
    queue.enqueue(`person:${id}`, async () => {
      const person = await getPerson(id).catch(() => null);
      if (!person) return 0;
      return (await recordPersonNews(id, person, today, { seed: seed.has(id) })).length;
    }).catch(() => 0),
  );
  return { people: ids.length, news: found.reduce((sum, n) => sum + n, 0) };
}

/** How stale the feeds may be when someone opens `/news` before they are read again. */
export const PRESS_FRESH_MS = 5 * 60 * 1000;
/** How stale followed people's credits may be when someone opens `/news` before they are looked at again. */
export const PEOPLE_FRESH_MS = 60 * 60 * 1000;

/**
 * When the feeds and followed people were last read on demand, in memory: a
 * restart forgets, and the first `/news` after it simply refreshes once. The
 * daily pass is the floor and does not stamp these.
 */
const newsReads = (g.trekkerNewsReads ??= new Map());

/**
 * When the feeds were last read, by the page or the daily pass: the News
 * page's "updated 2 min ago". Null after a restart until the next read.
 */
export function newsReadAt(): number | null {
  const times = [newsReads.get("press"), pressPassAt()].filter((t): t is number => typeof t === "number");
  return times.length ? Math.max(...times) : null;
}

/** For tests: forget when news was last read. */
export function forgetNewsReads() {
  newsReads.clear();
}

/**
 * News on demand (Round 9 follow-ups): `/news`, after it has painted, asks
 * for this. The feeds are read again if the last read here was over five
 * minutes ago, followed people looked at again if over an hour ago, each
 * through the same gated, fail-soft passes the daily one uses. One refresh at
 * a time per instance, by the queue's key: a second caller while one runs
 * shares its answer. A time is stamped as the read starts, so a failing feed
 * is not asked again until its five minutes are up. Says what it ran.
 *
 * `force` is the page's Refresh button (Round 10): the feeds are read
 * whatever their five minutes say, since someone asked; followed people still
 * wait for their hour, which is TMDB's time, not the feeds'.
 */
export function refreshNewsOnDemand(now = Date.now(), { force = false }: { force?: boolean } = {}) {
  return queue.enqueue("news-refresh", async () => {
    const due = (what: "press" | "people", fresh: number) => now - (newsReads.get(what) ?? -Infinity) >= fresh;
    const press = force || due("press", PRESS_FRESH_MS);
    const people = due("people", PEOPLE_FRESH_MS);
    if (press) newsReads.set("press", now);
    if (people) newsReads.set("people", now);
    const [read, looked] = await Promise.all([
      press ? runPressPass().catch(() => null) : null,
      people ? checkFollowedPeople().catch(() => null) : null,
    ]);
    return { press, people, added: (read?.added ?? 0) + (looked?.news ?? 0) };
  });
}

/**
 * The one-off for people followed before a first look seeded news, run
 * shortly after start-up so an instance updated in the afternoon does not wait
 * for 04:00 to show them. Nothing to do once each has a row; the daily pass
 * would seed them anyway.
 */
export async function seedFollowedPeople() {
  const ids = await unseededPersonIds();
  if (ids.length === 0) return { people: 0, news: 0 };
  return checkFollowedPeople(todayKey(), { only: ids });
}

/**
 * Smart lists first, so availability then covers what they found; then
 * availability for everything on a watchlist, favourite or list and every show
 * in progress; then auto-request, which needs both; watchlist enrichment and
 * film release dates; followed people's new work; the press feeds, after
 * everything that fills the cache they are matched against; housekeeping.
 */
export async function runDailyPass() {
  const { fresh, ...smartLists } = await rebuildSmartLists();
  const [sources, titles, regions] = await Promise.all([availabilitySources(), titlesToCheck(), regionsInUse()]);
  const availability = await refreshAvailability(titles, sources, regions, (key, task) => queue.enqueue(key, task));
  // Only with Overseerr connected: the switch is not offered without it.
  const autoRequests = sources.seerr ? await autoRequestNew(fresh) : { filed: 0, failed: 0 };
  const enrichment = await enrichWatchlist();
  const releases = await refreshReleaseDates();
  const people = await checkFollowedPeople();
  // Other people's websites: fails soft per feed, and a pass that cannot read one carries on.
  const press = await runPressPass().catch(() => ({ feeds: 0, read: 0, added: 0 }));
  const notificationsPruned = await capNotificationReads();
  const cachePruned = await pruneTmdbCache();
  const pressPruned = await prunePress();
  return { smartLists, availability, autoRequests, enrichment, releases, people, press, notificationsPruned, cachePruned, pressPruned };
}

/**
 * One title's availability, now: the Overseerr webhook's follow-up, so a
 * title Overseerr says has arrived gets its Plex item (and Play on Plex)
 * without waiting for 04:00. Deduped with the daily pass by the same key.
 */
export async function scheduleAvailability(title: TitleRef) {
  const [sources, regions] = await Promise.all([availabilitySources(), regionsInUse()]);
  return refreshAvailability([title], sources, regions, (key, task) => queue.enqueue(key, task));
}

/** Everything the daily pass checks, now: after the admin links a server, so marks do not wait a night. */
export async function scheduleAvailabilitySweep() {
  const [sources, titles, regions] = await Promise.all([availabilitySources(), titlesToCheck(), regionsInUse()]);
  return refreshAvailability(titles, sources, regions, (key, task) => queue.enqueue(key, task));
}

// ---------------------------------------------------------------------------
// Plex history

/** One person's Plex history, through the queue so the pass and Sync now never run it twice at once. */
export function schedulePlexSync(userId: string, options: { library?: boolean } = {}) {
  return queue.enqueue(`plex-history:${userId}`, () => syncPlexHistory(userId, options));
}

/** Everyone with a Plex identity, one at a time: each walks the same home server. */
export async function runPlexHistoryPass() {
  const ids = await plexSyncAccounts();
  const outcomes = await mapLimit(ids, 1, (id) => schedulePlexSync(id).catch(() => null));
  return { accounts: ids.length, logged: outcomes.reduce((n, o) => n + (o?.ok ? o.summary.logged : 0), 0) };
}

// ---------------------------------------------------------------------------
// The import backfill

export type BackfillProgress = { running: boolean; total: number; done: number };

/**
 * Works out where this person is in every show in their history and on their
 * watchlist: one `refreshShow` each, four at a time, with progress on the user
 * row after every show so the dashboard can say how far along it is.
 *
 * Mostly cache hits after the first person on an instance has been through,
 * since shows are shared and details keep a week.
 */
export function startBackfill(userId: string): Promise<void> {
  const running = backfills.get(userId);
  if (running) return running;

  const job = (async () => {
    const [watched, listed] = await Promise.all([
      db.watchedEpisode.findMany({ where: { userId }, select: { showId: true }, distinct: ["showId"] }),
      db.watchlistItem.findMany({ where: { userId, mediaType: "tv" }, select: { tmdbId: true } }),
    ]);
    const shows = [...new Set([...watched.map((w) => w.showId), ...listed.map((l) => l.tmdbId)])];

    await db.user.update({
      where: { id: userId },
      data: { backfillTotal: shows.length, backfillDone: 0, backfillStartedAt: new Date(), backfillFinishedAt: null },
    });

    const online = tmdbConfigured();
    await mapLimit(shows, CONCURRENCY, async (showId) => {
      if (online) await refreshShow(showId, { alsoFor: [userId] }).catch(() => false);
      // Without TMDB there is no episode list, but the watched half can still
      // be written, so the rows exist for the day a key is added.
      else await recomputeTitleState(db, userId, showId).catch(() => undefined);
      await db.user.update({ where: { id: userId }, data: { backfillDone: { increment: 1 } } });
    });

    await db.user.update({ where: { id: userId }, data: { backfillFinishedAt: new Date() } });
    await evaluateBadges(userId);
  })()
    .catch((error) => console.error(`backfill for ${userId} failed`, error))
    .finally(() => backfills.delete(userId));

  backfills.set(userId, job);
  return job;
}

/**
 * The badges page's full pass, run once when a history arrives. Unlocks and the
 * level's completion counts are otherwise written only when someone opens
 * Badges, so an imported history showed a level that jumped on that first
 * visit. Imported lazily: the achievements read title facts, which queue their
 * lookups here, and a static import would make the two modules a cycle.
 */
async function evaluateBadges(userId: string) {
  const { boardFor } = await import("./achievements");
  await boardFor(userId).catch((error) => console.error(`badge evaluation for ${userId} failed`, error));
}

/** Evaluations started from `ensureBackfill` in this process, so a busy Home asks once. */
const evaluations = new Set<string>();

/**
 * The dashboard's check. Starts the backfill when this person has never had
 * one, or when one was interrupted by a restart (started, not finished, and
 * not running here), and reports progress either way. Never waits for it.
 */
export async function ensureBackfill(userId: string): Promise<BackfillProgress> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { backfillTotal: true, backfillDone: true, backfillFinishedAt: true, levelSyncedAt: true },
  });
  if (!user) return { running: false, total: 0, done: 0 };

  if (user.backfillFinishedAt) {
    // A backfill that finished before badges were evaluated after it (a
    // database migrated before this pass existed, or a restart between the
    // two) is evaluated now, behind the page. The full pass stamps
    // `levelSyncedAt`, so this happens once.
    const stale = !user.levelSyncedAt || user.levelSyncedAt < user.backfillFinishedAt;
    if (stale && !evaluations.has(userId)) {
      evaluations.add(userId);
      void evaluateBadges(userId);
    }
    return { running: false, total: user.backfillTotal, done: user.backfillDone };
  }

  const alreadyRunning = backfills.has(userId);
  if (!alreadyRunning) void startBackfill(userId);
  return {
    running: true,
    // Freshly started: the count is being taken, and the card says so.
    total: alreadyRunning ? user.backfillTotal : 0,
    done: alreadyRunning ? user.backfillDone : 0,
  };
}

/** For the cron route: everyone who has never been backfilled. */
export async function runPendingBackfills() {
  const users = await db.user.findMany({ where: { backfillFinishedAt: null }, select: { id: true } });
  await mapLimit(users, 1, (u) => startBackfill(u.id));
  return { users: users.length };
}

// ---------------------------------------------------------------------------
// Timers

const SIX_HOURS = 6 * 60 * 60 * 1000;
const HALF_HOUR = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function msUntilNext(hour: number, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function guarded(name: string, job: () => Promise<unknown>) {
  let busy = false;
  return () => {
    // A slow pass must not stack a second copy of itself on top.
    if (busy) return;
    busy = true;
    job()
      .catch((error) => console.error(`${name} failed`, error))
      .finally(() => {
        busy = false;
      });
  };
}

/**
 * Started once per process from `instrumentation.ts`. Timers are unref'd so
 * they never keep a process alive that is trying to exit. The returning pass
 * also runs a minute after boot, since a container that was down for a day
 * should not wait six hours to catch up.
 */
export function startScheduler() {
  if (g.trekkerScheduler) return;
  g.trekkerScheduler = true;

  const returning = guarded("returning-shows pass", runReturningPass);
  const daily = guarded("daily pass", runDailyPass);

  setTimeout(returning, 60_000).unref();
  setInterval(returning, SIX_HOURS).unref();

  // Once, clear of the returning pass: people followed before first looks seeded news.
  setTimeout(guarded("person news seed", seedFollowedPeople), 90_000).unref();
  // Once, if Popular has nothing at all (a new instance, or the first start with feeds), rather than waiting for 04:00.
  setTimeout(
    guarded("press catch-up", async () => ((await db.newsItem.count({ where: { subject: "press" } })) === 0 ? runPressPass() : null)),
    150_000,
  ).unref();

  // Two minutes in, clear of the returning pass, then every half hour.
  const plex = guarded("plex history pass", runPlexHistoryPass);
  setTimeout(plex, 120_000).unref();
  setInterval(plex, HALF_HOUR).unref();

  setTimeout(() => {
    daily();
    setInterval(daily, DAY_MS).unref();
  }, msUntilNext(4)).unref();

  console.info(`refresh timers started; TMDB ${tmdbConfigured() ? "configured" : "not configured, nothing will be fetched"}`);
}
