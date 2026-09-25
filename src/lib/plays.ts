import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { recomputeTitleState } from "./title-state";

/**
 * Every viewing, and the only place watched state is written.
 *
 * `Play` is the log of what was watched and when. `WatchedMovie` and
 * `WatchedEpisode` are a uniqueness index over it ("have I seen this"), the
 * watched half of `TitleState` is where that leaves each show, and the counts
 * on `User` are what the profile reads. All four are written here, in one
 * transaction per call, and nowhere else. If you are reaching for
 * `db.watchedEpisode.create` somewhere else, the answer is `recordPlay`.
 */

type Tx = Prisma.TransactionClient;

export type PlaySource = "manual" | "plex" | "trakt" | "backfill";

/** What can be watched: a film, or one episode of a show. */
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
  /** TMDB audience score, films only: a fact about the title, kept on its row. */
  score?: number | null;
  /** Defaults to now. */
  watchedAt?: Date | null;
  source?: PlaySource;
  /** The source's own id for this viewing, where it has one. */
  sourceRef?: string | null;
  /**
   * Logged from Up next itself: the show keeps its place there for the rest of
   * the day instead of jumping to the top (see `heldAt` in the schema).
   */
  holdPlace?: boolean;
};

export type PlayResult = {
  /** False when the report was suppressed as a duplicate or adopted a row. */
  created: boolean;
  playId: string | null;
  isRewatch: boolean;
  plays: number;
  firstWatchedAt: Date;
  lastWatchedAt: Date;
};

/**
 * How close two viewings of the same thing must be for the second to count as
 * a duplicate report rather than a rewatch.
 *
 * Plex scrobbles around 90% of the way through and a film runs 90 to 180
 * minutes, so four hours is one film with generous slack. Half an hour is
 * enough for episodes because the identity includes the episode number: a
 * marathon of different episodes is never affected, and nobody rewatches the
 * same episode inside thirty minutes.
 */
export const DUPLICATE_WINDOW_MS = { movie: 4 * 60 * 60 * 1000, tv: 30 * 60 * 1000 } as const;

/**
 * Sources whose ref-less rows a sourced report may claim as its own. Each of
 * these stands for a viewing somebody else knew about first without saying
 * exactly which one, so a Plex history entry for the same episode is read as
 * describing it. `manual` is absent on purpose: a tick in Trekker is the
 * user's own assertion, and not this code's to reinterpret.
 */
const ADOPTABLE_SOURCES: PlaySource[] = ["backfill", "trakt", "plex"];

function identity(userId: string, target: PlayTarget) {
  return {
    userId,
    mediaType: target.mediaType,
    tmdbId: target.tmdbId,
    seasonNumber: target.seasonNumber ?? null,
    episodeNumber: target.episodeNumber ?? null,
  };
}

type Describe = {
  title: string;
  poster?: string | null;
  episodeName?: string | null;
  runtime?: number | null;
  score?: number | null;
};

/**
 * Rebuilds the watched row from the log: first play, last play, how many.
 * Derived, never incremented, so a delete or a date correction lands the same
 * way an insert does. Removes the row when the last play has gone.
 */
async function resync(tx: Tx, userId: string, target: PlayTarget, describe?: Describe) {
  const summary = await tx.play.aggregate({
    where: identity(userId, target),
    _count: { _all: true },
    _min: { watchedAt: true },
    _max: { watchedAt: true },
  });
  const plays = summary._count._all;

  const episodeKey = {
    userId_showId_seasonNumber_episodeNumber: {
      userId,
      showId: target.tmdbId,
      seasonNumber: target.seasonNumber ?? 0,
      episodeNumber: target.episodeNumber ?? 0,
    },
  };

  if (plays === 0) {
    if (target.mediaType === "movie") {
      await tx.watchedMovie.deleteMany({ where: { userId, movieId: target.tmdbId } });
    } else {
      await tx.watchedEpisode.deleteMany({ where: episodeKey.userId_showId_seasonNumber_episodeNumber });
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
        // Only ever filled in: a later report with less detail must not blank
        // out a title or a poster already there.
        title: describe?.title ?? undefined,
        poster: describe?.poster ?? undefined,
        runtime: describe?.runtime || undefined,
        score: describe?.score ?? undefined,
      },
    });
  } else {
    await tx.watchedEpisode.upsert({
      where: episodeKey,
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
 * The counts on `User`, re-derived. Four COUNT/SUM queries on indexes that
 * start with `userId`: cheap, and unlike an increment, correct whatever path
 * got here.
 */
async function refreshCounts(tx: Tx, userId: string) {
  const [episodes, movies, plays] = await Promise.all([
    tx.watchedEpisode.count({ where: { userId } }),
    tx.watchedMovie.count({ where: { userId } }),
    tx.play.aggregate({ where: { userId }, _count: { _all: true }, _sum: { runtime: true } }),
  ]);
  await tx.user.update({
    where: { id: userId },
    data: {
      watchedEpisodeCount: episodes,
      watchedMovieCount: movies,
      playCount: plays._count._all,
      minutesWatched: plays._sum.runtime ?? 0,
    },
  });
}

/** Everything downstream of the log, brought into line with it. */
async function settle(tx: Tx, userId: string, target: PlayTarget, describe?: Describe, holdPlace = false) {
  const current = await resync(tx, userId, target, describe);
  if (target.mediaType === "tv") {
    await recomputeTitleState(tx, userId, target.tmdbId, {
      describe: describe ? { showName: describe.title, showPoster: describe.poster ?? undefined } : undefined,
      place: holdPlace ? "hold" : "follow",
    });
  }
  await refreshCounts(tx, userId);
  return current;
}

/** Called when a viewing lands on a show the refresh job has never seen. */
type UnknownShowHook = (showId: number) => void;

/**
 * `refresh.ts` registers itself here rather than being imported, so this
 * module stays free of the network and of the queue, and a test can record a
 * play without a job starting behind it. Held on `globalThis` because Next
 * may bundle this module more than once (instrumentation, actions, pages), and
 * a registration in one copy has to be seen by all of them.
 */
const hooks = globalThis as unknown as { trekkerUnknownShow?: UnknownShowHook | null };

export function setUnknownShowHook(hook: UnknownShowHook | null) {
  hooks.trekkerUnknownShow = hook;
}

async function afterCommit(userId: string, target: PlayTarget) {
  const onUnknownShow = hooks.trekkerUnknownShow;
  if (target.mediaType !== "tv" || !onUnknownShow) return;
  const state = await db.titleState.findUnique({
    where: { userId_showId: { userId, showId: target.tmdbId } },
    select: { airedAt: true },
  });
  if (state && !state.airedAt) onUnknownShow(target.tmdbId);
}

/**
 * Logs one viewing, and brings every row that depends on it up to date in the
 * same transaction.
 *
 * Suppressed duplicates come back as `created: false` with the state as it
 * already stood, not as an error: every caller is reporting something that did
 * happen, and "we already knew" is not a failure. Callers showing a count must
 * use the returned `plays` rather than adding one of their own.
 */
export async function recordPlay(userId: string, input: PlayInput): Promise<PlayResult> {
  const watchedAt = input.watchedAt ?? new Date();
  const source = input.source ?? "manual";
  const sourceRef = input.sourceRef ?? null;
  const target: PlayTarget = {
    mediaType: input.mediaType,
    tmdbId: input.tmdbId,
    seasonNumber: input.mediaType === "tv" ? (input.seasonNumber ?? null) : null,
    episodeNumber: input.mediaType === "tv" ? (input.episodeNumber ?? null) : null,
  };
  const describe: Describe = {
    title: input.title,
    poster: input.poster,
    episodeName: input.episodeName,
    runtime: input.runtime,
    score: input.score,
  };

  const result = await db.$transaction(async (tx) => {
    const finish = async (created: boolean, playId: string | null = null): Promise<PlayResult> => {
      const current = await settle(tx, userId, target, describe, input.holdPlace === true);
      return {
        created,
        playId,
        isRewatch: (current?.plays ?? 0) > 1,
        plays: current?.plays ?? 0,
        firstWatchedAt: current?.firstWatchedAt ?? watchedAt,
        lastWatchedAt: current?.lastWatchedAt ?? watchedAt,
      };
    };

    // Guard one: the source's own id for this viewing, already logged. This is
    // what lets a Plex history sync run every few minutes forever without
    // piling up a copy of every rewatch it can see. It only rules a play out:
    // an unseen id still has to clear the window below, because Plex writes two
    // history rows for one viewing that was paused and resumed.
    if (sourceRef !== null) {
      const seen = await tx.play.findUnique({
        where: { userId_source_sourceRef: { userId, source, sourceRef } },
        select: { id: true },
      });
      if (seen) return finish(false);

      // Deleted on purpose, once. The row is gone, so the guard above cannot
      // see it; this is what stops "remove this watch" being undone by the
      // next sync.
      const buried = await tx.deletedPlay.findUnique({
        where: { userId_source_sourceRef: { userId, source, sourceRef } },
        select: { id: true },
      });
      if (buried) return finish(false);

      // Guard two: a row already standing for this viewing but without the id
      // to prove it. Claimed rather than doubled, oldest first and one per
      // report, so a second history entry becomes the genuine second play it is.
      // The sourced timestamp wins, being the precise one.
      const unproven = await tx.play.findFirst({
        where: { ...identity(userId, target), sourceRef: null, source: { in: ADOPTABLE_SOURCES } },
        orderBy: { watchedAt: "asc" },
        select: { id: true },
      });
      if (unproven) {
        await tx.play.update({ where: { id: unproven.id }, data: { source, sourceRef, watchedAt } });
        return finish(false);
      }
    }

    // Guard three: two reports of one viewing with no shared id, such as a
    // webhook and the now-playing poll both firing, or a double tap. A query
    // rather than a memory, because they arrive on different requests.
    const window = DUPLICATE_WINDOW_MS[input.mediaType];
    const nearby = await tx.play.findFirst({
      where: {
        ...identity(userId, target),
        watchedAt: {
          gte: new Date(watchedAt.getTime() - window),
          lte: new Date(watchedAt.getTime() + window),
        },
      },
      select: { id: true },
    });
    if (nearby) return finish(false);

    const play = await tx.play.create({
      data: {
        ...identity(userId, target),
        title: input.title,
        poster: input.poster ?? null,
        episodeName: input.episodeName ?? null,
        runtime: input.runtime ?? 0,
        watchedAt,
        source,
        sourceRef,
      },
      select: { id: true },
    });
    return finish(true, play.id);
  });

  await afterCommit(userId, target);
  return result;
}

/**
 * Records several viewings that may or may not be known already, each through
 * the full set of guards. For importers, which cannot know. Returns how many
 * were genuinely new.
 */
export async function recordPlays(userId: string, inputs: PlayInput[]): Promise<number> {
  let created = 0;
  for (const input of inputs) {
    if ((await recordPlay(userId, input)).created) created += 1;
  }
  return created;
}

/**
 * Removes viewings, and reverses everything `recordPlay` wrote for them.
 *
 * "last" drops the most recent viewing and leaves the rest: after a mis-tap the
 * intent is to undo that one, and erasing years of rewatches for a fat finger
 * is not recoverable. "all" clears the title outright.
 *
 * Sourced viewings are buried in `DeletedPlay` so the next sync does not bring
 * them back. A ref-less viewing has nothing a sync could match, so it is not.
 */
export async function removePlay(
  userId: string,
  target: PlayTarget,
  mode: "last" | "all" = "last",
): Promise<{ remaining: number; lastWatchedAt: Date | null }> {
  const normalised: PlayTarget = {
    ...target,
    seasonNumber: target.mediaType === "tv" ? (target.seasonNumber ?? null) : null,
    episodeNumber: target.mediaType === "tv" ? (target.episodeNumber ?? null) : null,
  };

  return db.$transaction(async (tx) => {
    const where = identity(userId, normalised);
    const doomed =
      mode === "all"
        ? await tx.play.findMany({ where, select: { id: true, source: true, sourceRef: true } })
        : await tx.play
            .findFirst({ where, orderBy: { watchedAt: "desc" }, select: { id: true, source: true, sourceRef: true } })
            .then((p) => (p ? [p] : []));

    if (doomed.length) {
      await tx.play.deleteMany({ where: { id: { in: doomed.map((p) => p.id) } } });
    }
    for (const play of doomed) {
      if (play.sourceRef === null) continue;
      const key = { userId, source: play.source, sourceRef: play.sourceRef };
      await tx.deletedPlay.upsert({
        where: { userId_source_sourceRef: key },
        create: key,
        update: {},
      });
    }

    const current = await settle(tx, userId, normalised);
    return { remaining: current?.plays ?? 0, lastWatchedAt: current?.lastWatchedAt ?? null };
  });
}

/**
 * Moves one viewing to another moment: "I watched that yesterday, not now".
 *
 * Only the person's own play, and never into the future. The watched rows,
 * `TitleState` and the counts are re-derived exactly as after a new viewing,
 * so a redated first watch moves `watchedAt` and Up next's warmth ordering with
 * it, unless `holdPlace` says the move was made from Home, where the row keeps
 * its place like the tick it corrects. Returns false when there was nothing of
 * theirs to move.
 */
export async function redatePlay(
  userId: string,
  playId: string,
  watchedAt: Date,
  options: { holdPlace?: boolean } = {},
): Promise<boolean> {
  if (Number.isNaN(watchedAt.getTime()) || watchedAt.getTime() > Date.now()) return false;
  return db.$transaction(async (tx) => {
    const play = await tx.play.findFirst({
      where: { id: playId, userId },
      select: { mediaType: true, tmdbId: true, seasonNumber: true, episodeNumber: true },
    });
    if (!play) return false;
    await tx.play.update({ where: { id: playId }, data: { watchedAt } });
    await settle(
      tx,
      userId,
      {
        mediaType: play.mediaType === "tv" ? "tv" : "movie",
        tmdbId: play.tmdbId,
        seasonNumber: play.seasonNumber,
        episodeNumber: play.episodeNumber,
      },
      undefined,
      options.holdPlace === true,
    );
    return true;
  });
}
