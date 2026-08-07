import "server-only";
import { db } from "./db";

/**
 * Every viewing, and the only place the watched tables are written.
 *
 * `Play` is the log of what was actually watched and when. `WatchedMovie` and
 * `WatchedEpisode` are a uniqueness index over it — "have I seen this" — kept in
 * step here and nowhere else. That is the whole design: two tables, one writer,
 * so they cannot drift. If you find yourself reaching for `db.watchedMovie
 * .create` somewhere else, the answer is `recordPlay`.
 *
 * The one thing written from outside is `WatchedMovie.score`, backfilled by
 * `stats.ts`. That is a fact about the film rather than about a viewing, so it
 * is not this module's business.
 */

export type PlaySource = "manual" | "plex" | "trakt" | "backfill";

/** What identifies a thing that can be watched: a film, or one episode. */
export type PlayTarget = {
  mediaType: "movie" | "tv";
  /** The film's id, or the *show's* id for an episode. */
  tmdbId: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
};

export type PlayInput = PlayTarget & {
  /** Film title, or show name. */
  title: string;
  poster?: string | null;
  episodeName?: string | null;
  runtime?: number | null;
  /** TMDB audience score, films only — stored on the title, not the viewing. */
  score?: number | null;
  /** Defaults to now. */
  watchedAt?: Date | null;
  source?: PlaySource;
  /** Stable id from that source, where it has one. See the schema comment. */
  sourceRef?: string | null;
};

export type PlayResult = {
  /** False when the play was suppressed as a duplicate. */
  created: boolean;
  /** True when this was not the first viewing. */
  isRewatch: boolean;
  plays: number;
  firstWatchedAt: Date;
  lastWatchedAt: Date;
};

/**
 * How close two viewings of the same thing have to be before the second is
 * treated as a duplicate report rather than a rewatch.
 *
 * Plex scrobbles at around 90% through, and a feature runs 90-180 minutes, so
 * four hours is one film plus generous slack — nobody watches the same film
 * twice inside it, while two scrobbles genuinely that far apart really are two
 * viewings. Half an hour is enough for episodes because the identity includes
 * the episode number: a marathon of *different* episodes is never affected, and
 * rewatching the same episode twice within thirty minutes is not a thing.
 */
const DUPLICATE_WINDOW_MS = { movie: 4 * 60 * 60 * 1000, tv: 30 * 60 * 1000 };

/**
 * Sources whose ref-less rows a sourced report may claim as itself.
 *
 * These are all rows that stand for a viewing somebody else knew about first:
 * the play log's own backfill, a Trakt import, and Plex library rows, which say
 * "watched" without saying when. None of them can prove *which* viewing they
 * describe, so when Plex history later turns up with a precise id for the same
 * episode, the sane reading is that it is describing the one we already have
 * rather than a second one.
 *
 * `manual` is not here on purpose. A tick in Trekker is the user's own
 * assertion, made at a time they chose, and it is not this code's place to
 * decide it was really some Plex session weeks earlier.
 */
const ADOPTABLE_SOURCES: PlaySource[] = ["backfill", "trakt", "plex"];

/** Prisma's `where` for one identity. Nulls matter: a film has no episode. */
function identity(userId: string, target: PlayTarget) {
  return {
    userId,
    mediaType: target.mediaType,
    tmdbId: target.tmdbId,
    seasonNumber: target.seasonNumber ?? null,
    episodeNumber: target.episodeNumber ?? null,
  };
}

/**
 * Rebuilds the watched row from the log: first play, last play, how many.
 *
 * Always derived, never incremented, so a delete or a date correction lands the
 * same way an insert does and no path has to remember to keep a counter honest.
 * Returns null when the last play has gone, having removed the row.
 */
async function resync(
  tx: Pick<typeof db, "play" | "watchedMovie" | "watchedEpisode">,
  userId: string,
  target: PlayTarget,
  describe?: { title: string; poster?: string | null; episodeName?: string | null; runtime?: number | null; score?: number | null },
): Promise<{ plays: number; firstWatchedAt: Date; lastWatchedAt: Date } | null> {
  const where = identity(userId, target);

  const summary = await tx.play.aggregate({
    where,
    _count: { _all: true },
    _min: { watchedAt: true },
    _max: { watchedAt: true },
  });

  const plays = summary._count._all;

  if (plays === 0) {
    if (target.mediaType === "movie") {
      await tx.watchedMovie
        .delete({ where: { userId_movieId: { userId, movieId: target.tmdbId } } })
        .catch(() => undefined);
    } else {
      await tx.watchedEpisode
        .delete({
          where: {
            userId_showId_seasonNumber_episodeNumber: {
              userId,
              showId: target.tmdbId,
              seasonNumber: target.seasonNumber ?? 0,
              episodeNumber: target.episodeNumber ?? 0,
            },
          },
        })
        .catch(() => undefined);
    }
    return null;
  }

  const firstWatchedAt = summary._min.watchedAt!;
  const lastWatchedAt = summary._max.watchedAt!;

  if (target.mediaType === "movie") {
    await tx.watchedMovie.upsert({
      where: { userId_movieId: { userId, movieId: target.tmdbId } },
      create: {
        userId,
        movieId: target.tmdbId,
        title: describe?.title ?? "Untitled",
        poster: describe?.poster ?? null,
        runtime: describe?.runtime ?? 0,
        score: describe?.score ?? null,
        watchedAt: firstWatchedAt,
        lastWatchedAt,
        plays,
      },
      update: {
        watchedAt: firstWatchedAt,
        lastWatchedAt,
        plays,
        // Only ever fill these in — a later report with less detail than the
        // first should not blank out a title or a poster that is already there.
        title: describe?.title ?? undefined,
        poster: describe?.poster ?? undefined,
        runtime: describe?.runtime || undefined,
        score: describe?.score ?? undefined,
      },
    });
  } else {
    await tx.watchedEpisode.upsert({
      where: {
        userId_showId_seasonNumber_episodeNumber: {
          userId,
          showId: target.tmdbId,
          seasonNumber: target.seasonNumber ?? 0,
          episodeNumber: target.episodeNumber ?? 0,
        },
      },
      create: {
        userId,
        showId: target.tmdbId,
        showName: describe?.title ?? "Untitled",
        showPoster: describe?.poster ?? null,
        seasonNumber: target.seasonNumber ?? 0,
        episodeNumber: target.episodeNumber ?? 0,
        episodeName: describe?.episodeName ?? "",
        runtime: describe?.runtime || 42,
        watchedAt: firstWatchedAt,
        lastWatchedAt,
        plays,
      },
      update: {
        watchedAt: firstWatchedAt,
        lastWatchedAt,
        plays,
        showName: describe?.title ?? undefined,
        showPoster: describe?.poster ?? undefined,
        episodeName: describe?.episodeName || undefined,
        runtime: describe?.runtime || undefined,
      },
    });
  }

  return { plays, firstWatchedAt, lastWatchedAt };
}

/**
 * Logs one viewing, and brings the watched row up to date with it.
 *
 * Suppressed duplicates come back as `created: false` with the state as it
 * already stood, rather than as an error — every caller is reporting something
 * that did happen, and "we already knew" is not a failure. Callers that show a
 * count must use the returned `plays` rather than adding one of their own, or
 * the screen will disagree with the next page load.
 */
export async function recordPlay(userId: string, input: PlayInput): Promise<PlayResult> {
  const watchedAt = input.watchedAt ?? new Date();
  const source = input.source ?? "manual";
  const sourceRef = input.sourceRef ?? null;
  const target: PlayTarget = {
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
    seasonNumber: input.seasonNumber ?? null,
    episodeNumber: input.episodeNumber ?? null,
  };
  const describe = {
    title: input.title,
    poster: input.poster,
    episodeName: input.episodeName,
    runtime: input.runtime,
    score: input.score,
  };

  const state = async (created: boolean): Promise<PlayResult> => {
    const current = await resync(db, userId, target, describe);
    return {
      created,
      isRewatch: (current?.plays ?? 0) > 1,
      plays: current?.plays ?? 0,
      firstWatchedAt: current?.firstWatchedAt ?? watchedAt,
      lastWatchedAt: current?.lastWatchedAt ?? watchedAt,
    };
  };

  // First guard: the source told us its own id for this viewing, and we have
  // already logged that exact id. One indexed lookup, and it is what lets the
  // background Plex history sync run every ten minutes forever without piling
  // up a duplicate of every rewatch it can see.
  //
  // Note this can only rule a play *out*. A previously unseen id still has to
  // clear the window below, because Plex will happily write two history rows
  // for one viewing that was paused and resumed — distinct ids, one evening.
  if (sourceRef !== null) {
    const seen = await db.play.findUnique({
      where: { userId_source_sourceRef: { userId, source, sourceRef } },
      select: { id: true },
    });
    if (seen) return state(false);

    // Deleted on purpose, once. The row is gone, so the guard above cannot see
    // it any more — this is what remembers, and what stops "remove this watch"
    // being undone by the next sync ten minutes later.
    const buried = await db.deletedPlay.findUnique({
      where: { userId_source_sourceRef: { userId, source, sourceRef } },
      select: { id: true },
    });
    if (buried) return state(false);

    /**
     * A row already standing for this viewing, but without the id to prove it.
     *
     * Claim it rather than adding a second one. This is what stops an import
     * and a Plex history entry describing the same evening from becoming a
     * spurious "2×" — which is exactly what the play log's own backfill
     * migration caused, having dropped the `sourceRef` from every Plex viewing
     * that had already been imported.
     *
     * The oldest is taken, and only one per report: a second history entry for
     * the same episode finds nothing left to claim and becomes the genuine
     * second play it is. The Plex timestamp wins, because it is the precise one
     * — a backfilled date is only ever a copy of whatever the watched row
     * happened to say.
     */
    const unproven = await db.play.findFirst({
      where: {
        ...identity(userId, target),
        sourceRef: null,
        source: { in: ADOPTABLE_SOURCES },
      },
      orderBy: { watchedAt: "asc" },
      select: { id: true },
    });

    if (unproven) {
      await db.play.update({
        where: { id: unproven.id },
        data: { source, sourceRef, watchedAt },
      });
      // Not `created`: nothing new happened, we merely learned what to call
      // something already on record.
      return state(false);
    }
  }

  // Second guard: two reports of the same viewing that carry no shared id — a
  // Plex Pass webhook and the now-playing poll both firing, or a double tap.
  // This has to be a query rather than an in-memory set, because those two
  // arrive on different requests and possibly in different processes.
  const window = DUPLICATE_WINDOW_MS[input.mediaType];
  const nearby = await db.play.findFirst({
    where: {
      ...identity(userId, target),
      watchedAt: {
        gte: new Date(watchedAt.getTime() - window),
        lte: new Date(watchedAt.getTime() + window),
      },
    },
    select: { id: true },
  });
  if (nearby) return state(false);

  await db.play.create({
    data: {
      userId,
      mediaType: target.mediaType,
      tmdbId: target.tmdbId,
      title: input.title,
      poster: input.poster ?? null,
      seasonNumber: target.seasonNumber,
      episodeNumber: target.episodeNumber,
      episodeName: input.episodeName ?? null,
      runtime: input.runtime ?? 0,
      watchedAt,
      source,
      sourceRef,
    },
  });

  return state(true);
}

export type NewEpisodePlay = {
  showId: number;
  showName: string;
  showPoster?: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  runtime: number;
  watchedAt?: Date;
};

/**
 * Logs a batch of episodes the caller has already established are not on record
 * — marking a season or a whole show, or catching up to a point in one.
 *
 * `recordPlay` is the wrong tool for these: it costs several queries an episode
 * to answer questions the caller has already answered, and a long-running show
 * is hundreds of episodes. Since every row here is a first viewing of a distinct
 * episode, both tables can be written straight out in bulk. Callers **must**
 * diff against what is already watched first — this trusts them to, which is why
 * it lives in here beside the thing it is a shortcut for.
 */
export async function recordNewEpisodePlays(
  userId: string,
  rows: NewEpisodePlay[],
): Promise<number> {
  if (rows.length === 0) return 0;

  // Chunked because SQLite caps how many variables one statement may bind.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);

    await db.watchedEpisode.createMany({
      data: chunk.map((row) => ({
        userId,
        showId: row.showId,
        showName: row.showName,
        showPoster: row.showPoster ?? null,
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        episodeName: row.episodeName,
        runtime: row.runtime,
        watchedAt: row.watchedAt,
        lastWatchedAt: row.watchedAt ?? new Date(),
        plays: 1,
      })),
    });

    await db.play.createMany({
      data: chunk.map((row) => ({
        userId,
        mediaType: "tv",
        tmdbId: row.showId,
        title: row.showName,
        poster: row.showPoster ?? null,
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        episodeName: row.episodeName,
        runtime: row.runtime,
        watchedAt: row.watchedAt,
        source: "manual" as const,
      })),
    });
  }

  return rows.length;
}

/** One episode to log another viewing of. Every row must be the same show. */
export type EpisodeRewatch = Omit<NewEpisodePlay, "watchedAt">;

/**
 * Logs *another* viewing of a batch of episodes — watching a season or a whole
 * show through again.
 *
 * The mirror of `recordNewEpisodePlays`, and separate from it for the same
 * reason that one exists: `recordPlay` costs several queries an episode, which
 * a two-hundred-episode run cannot afford. The difference is that these rows
 * mostly *do* have history, so the watched row is moved on rather than created
 * — one `increment` per season instead of a read-modify-write per episode.
 *
 * Episodes already logged inside the duplicate window are skipped, so a double
 * press, or marking a season watched and immediately watching it again, cannot
 * invent a viewing that did not happen. Episodes with no history at all are
 * fine to include: they simply become ordinary first viewings, which is the
 * truth when someone rewatches a season they had only partly logged.
 *
 * Returns how many viewings were actually written.
 */
export async function recordEpisodeRewatches(
  userId: string,
  rows: EpisodeRewatch[],
  watchedAt = new Date(),
): Promise<number> {
  if (rows.length === 0) return 0;

  const showId = rows[0].showId;
  const key = (row: { seasonNumber: number; episodeNumber: number }) =>
    `${row.seasonNumber}-${row.episodeNumber}`;

  const lastSeen = new Map(
    (
      await db.watchedEpisode.findMany({
        where: { userId, showId },
        select: {
          seasonNumber: true,
          episodeNumber: true,
          watchedAt: true,
          lastWatchedAt: true,
        },
      })
      // `lastWatchedAt` is nullable on rows written before it existed; the
      // first-watched date is the best answer there and is never null.
    ).map((row) => [key(row), row.lastWatchedAt ?? row.watchedAt] as const),
  );

  const fresh = rows.filter((row) => {
    const last = lastSeen.get(key(row));
    return !last || Math.abs(watchedAt.getTime() - last.getTime()) > DUPLICATE_WINDOW_MS.tv;
  });
  if (fresh.length === 0) return 0;

  // Chunked because SQLite caps how many variables one statement may bind.
  for (let i = 0; i < fresh.length; i += 200) {
    await db.play.createMany({
      data: fresh.slice(i, i + 200).map((row) => ({
        userId,
        mediaType: "tv" as const,
        tmdbId: row.showId,
        title: row.showName,
        poster: row.showPoster ?? null,
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        episodeName: row.episodeName,
        runtime: row.runtime,
        watchedAt,
        source: "manual" as const,
      })),
    });
  }

  const firsts = fresh.filter((row) => !lastSeen.has(key(row)));
  const repeats = fresh.filter((row) => lastSeen.has(key(row)));

  for (let i = 0; i < firsts.length; i += 200) {
    await db.watchedEpisode.createMany({
      data: firsts.slice(i, i + 200).map((row) => ({
        userId,
        showId: row.showId,
        showName: row.showName,
        showPoster: row.showPoster ?? null,
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        episodeName: row.episodeName,
        runtime: row.runtime,
        watchedAt,
        lastWatchedAt: watchedAt,
        plays: 1,
      })),
    });
  }

  const bySeason = new Map<number, number[]>();
  for (const row of repeats) {
    const list = bySeason.get(row.seasonNumber);
    if (list) list.push(row.episodeNumber);
    else bySeason.set(row.seasonNumber, [row.episodeNumber]);
  }

  for (const [seasonNumber, episodeNumbers] of bySeason) {
    for (let i = 0; i < episodeNumbers.length; i += 200) {
      await db.watchedEpisode.updateMany({
        where: {
          userId,
          showId,
          seasonNumber,
          episodeNumber: { in: episodeNumbers.slice(i, i + 200) },
        },
        // `watchedAt` is deliberately untouched: it is when this was first
        // discovered, and a rewatch is not that.
        data: { plays: { increment: 1 }, lastWatchedAt: watchedAt },
      });
    }
  }

  return fresh.length;
}

/**
 * Records several viewings that may or may not already be known, each going
 * through the full duplicate check. For importers, where the caller cannot know.
 *
 * Returns how many were genuinely new.
 */
export async function recordPlays(userId: string, inputs: PlayInput[]): Promise<number> {
  let created = 0;
  for (const input of inputs) {
    const result = await recordPlay(userId, input);
    if (result.created) created += 1;
  }
  return created;
}

/**
 * Removes viewings.
 *
 * "last" drops the most recent one and leaves the rest — after a mis-tap the
 * intent is to undo *that*, and quietly erasing years of rewatch history for a
 * fat finger is not recoverable. "all" clears the title outright, which is what
 * unwatching a season or a whole show means.
 */
export async function deletePlays(
  userId: string,
  target: PlayTarget,
  mode: "last" | "all",
): Promise<{ remaining: number; lastWatchedAt: Date | null }> {
  if (mode === "all") {
    const doomed = await db.play.findMany({
      where: identity(userId, target),
      select: { source: true, sourceRef: true },
    });
    await db.play.deleteMany({ where: identity(userId, target) });
    await bury(userId, doomed);
  } else {
    const newest = await db.play.findFirst({
      where: identity(userId, target),
      orderBy: { watchedAt: "desc" },
      select: { id: true, source: true, sourceRef: true },
    });
    if (newest) {
      await db.play.delete({ where: { id: newest.id } });
      await bury(userId, [newest]);
    }
  }

  const current = await resync(db, userId, target);
  // Handed back so a caller showing a date can show the one that is now true,
  // rather than the viewing it has just removed.
  return { remaining: current?.plays ?? 0, lastWatchedAt: current?.lastWatchedAt ?? null };
}

/**
 * Clears a whole show, or one season of it — "unmark all".
 *
 * Both tables go together: a play left behind with no episode above it would go
 * on counting minutes towards a total for something the user has just said they
 * never watched.
 */
export async function clearShow(userId: string, showId: number, seasonNumber?: number) {
  const scope = seasonNumber === undefined ? {} : { seasonNumber };
  const where = { userId, mediaType: "tv", tmdbId: showId, ...scope };

  const doomed = await db.play.findMany({ where, select: { source: true, sourceRef: true } });

  await db.watchedEpisode.deleteMany({ where: { userId, showId, ...scope } });
  await db.play.deleteMany({ where });

  await bury(userId, doomed);
}

/**
 * Records that these viewings were deleted deliberately, so a re-sync leaves
 * them alone.
 *
 * Only the ones carrying an id are worth remembering: a ref-less play has
 * nothing a sync could match it against, so nothing would resurrect it. Written
 * one at a time and forgiving of collisions — SQLite has no `skipDuplicates`,
 * and a gravestone that is already there is the state we wanted anyway.
 */
async function bury(userId: string, plays: { source: string; sourceRef: string | null }[]) {
  for (const play of plays) {
    if (play.sourceRef === null) continue;
    await db.deletedPlay
      .create({ data: { userId, source: play.source, sourceRef: play.sourceRef } })
      .catch(() => undefined);
  }
}

/**
 * Corrects when something was watched.
 *
 * The date menu says "Logged just now. Watched it earlier?", so it is correcting
 * the viewing that was just made, not the title's whole history: the most recent
 * play moves and the older ones stay where they are. If that puts it behind an
 * earlier play, recomputing first/last from the log sorts it out by itself.
 */
export async function setPlayDate(
  userId: string,
  target: PlayTarget,
  when: Date,
  playId?: string,
): Promise<{ ok: boolean; lastWatchedAt: Date | null }> {
  const play = playId
    ? await db.play.findFirst({ where: { id: playId, userId }, select: { id: true } })
    : await db.play.findFirst({
        where: identity(userId, target),
        orderBy: { watchedAt: "desc" },
        select: { id: true },
      });

  if (play) {
    await db.play.update({ where: { id: play.id }, data: { watchedAt: when } });
    const current = await resync(db, userId, target);
    // Not necessarily the date just picked: moving the newest viewing behind an
    // older one makes that older one the latest. The caller wants what is true.
    return { ok: true, lastWatchedAt: current?.lastWatchedAt ?? null };
  }

  // No play at all: a row that predates the log, or one whose plays were removed
  // out from under it. Correct the row directly and give it a play to stand on.
  const existing =
    target.mediaType === "movie"
      ? await db.watchedMovie.findUnique({
          where: { userId_movieId: { userId, movieId: target.tmdbId } },
        })
      : await db.watchedEpisode.findUnique({
          where: {
            userId_showId_seasonNumber_episodeNumber: {
              userId,
              showId: target.tmdbId,
              seasonNumber: target.seasonNumber ?? 0,
              episodeNumber: target.episodeNumber ?? 0,
            },
          },
        });

  if (!existing) return { ok: false, lastWatchedAt: null };

  await db.play.create({
    data: {
      userId,
      mediaType: target.mediaType,
      tmdbId: target.tmdbId,
      title: "showName" in existing ? existing.showName : existing.title,
      poster: "showPoster" in existing ? existing.showPoster : existing.poster,
      seasonNumber: target.seasonNumber ?? null,
      episodeNumber: target.episodeNumber ?? null,
      episodeName: "episodeName" in existing ? existing.episodeName : null,
      runtime: existing.runtime,
      watchedAt: when,
      source: "backfill",
    },
  });

  const repaired = await resync(db, userId, target);
  return { ok: true, lastWatchedAt: repaired?.lastWatchedAt ?? null };
}

/**
 * Rebuilds every counter on the watched tables from the log.
 *
 * Nothing should need this — the counters are derived on every write — but they
 * are denormalised, and a denormalised number with no way to repair it is a
 * number you cannot trust. Cheap to run, safe to run twice.
 */
export async function reconcile(userId: string): Promise<{ movies: number; episodes: number }> {
  const [movies, episodes] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId }, select: { movieId: true } }),
    db.watchedEpisode.findMany({
      where: { userId },
      select: { showId: true, seasonNumber: true, episodeNumber: true },
    }),
  ]);

  for (const movie of movies) {
    await resync(db, userId, { mediaType: "movie", tmdbId: movie.movieId });
  }
  for (const episode of episodes) {
    await resync(db, userId, {
      mediaType: "tv",
      tmdbId: episode.showId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
    });
  }

  return { movies: movies.length, episodes: episodes.length };
}
