import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Progress for an import that is still running.
 *
 * An import is the one thing in the app that takes minutes rather than
 * milliseconds — several hundred TMDB lookups and a bulk write behind them —
 * and it used to be done inside the server action that started it. That is what
 * broke it: the browser held a single POST open for the whole run, and anything
 * that closed that connection first (a reverse proxy's read timeout, an
 * installed app being backgrounded by iOS, a phone changing network) left the
 * router with a response it could not use. The work had already happened, which
 * is why the history arrived and the page still fell over.
 *
 * So the request no longer waits for the work. Starting an import registers a
 * job here, kicks the run off, and answers straight away with an id; the page
 * then asks how it is going. That also gives the reader something better than a
 * sweeping bar — "matching film 50 of 200" is a real answer to "is this stuck?".
 *
 * Deliberately in memory rather than in the database. A job is only meaningful
 * while the process that is running it is alive: if the container restarts, the
 * import stops too, and a row that outlived it would say "running" forever.
 * Nothing here is worth persisting — what the import produced is already in the
 * tables it wrote to.
 */

export type ImportSummary = {
  movies: number;
  episodes: number;
  updated: number;
  skipped: number;
};

export type ImportJob = {
  id: string;
  userId: string;
  status: "running" | "done" | "failed";
  /** What it is doing, in words, e.g. "Matching films to TMDB". */
  stage: string;
  /** How far through the current stage. `total` is 0 when it cannot be known. */
  done: number;
  total: number;
  error?: string;
  summary?: ImportSummary;
  startedAt: number;
  finishedAt?: number;
};

/** How you tell a job what is happening, handed to the work itself. */
export type Report = (update: { stage?: string; done?: number; total?: number }) => void;

/** How long a finished job stays readable, so the page can collect its result. */
const KEEP_MS = 10 * 60 * 1000;

/**
 * Survives a hot reload, for the same reason the Prisma client does: a job
 * started before an edit is still running in the same process afterwards, and
 * a fresh module would have lost the only handle on it.
 */
const store = ((globalThis as { __trekkerImports?: Map<string, ImportJob> }).__trekkerImports ??=
  new Map<string, ImportJob>());

function sweep() {
  const cutoff = Date.now() - KEEP_MS;
  for (const [id, job] of store) {
    if (job.finishedAt !== undefined && job.finishedAt < cutoff) store.delete(id);
  }
}

export function createImportJob(userId: string, stage: string): ImportJob {
  sweep();

  const job: ImportJob = {
    id: randomUUID(),
    userId,
    status: "running",
    stage,
    done: 0,
    total: 0,
    startedAt: Date.now(),
  };

  store.set(job.id, job);
  return job;
}

/**
 * Only ever returns a job belonging to the asker. The id is a v4 uuid and so
 * not guessable, but "not guessable" is not the same as "not yours".
 */
export function getImportJob(id: string, userId: string): ImportJob | null {
  const job = store.get(id);
  return job && job.userId === userId ? job : null;
}

/** Whatever this user has running, so a reload can pick the thread back up. */
export function findRunningImport(userId: string): ImportJob | null {
  for (const job of store.values()) {
    if (job.userId === userId && job.status === "running") return job;
  }
  return null;
}

/**
 * A reporter for one job.
 *
 * Naming a new stage resets the count, because "50" means nothing without the
 * thing it is 50 of, and carrying the previous stage's number into the next one
 * for the instant before the caller sets it is how a bar jumps backwards.
 */
export function reporterFor(job: ImportJob): Report {
  return ({ stage, done, total }) => {
    if (stage !== undefined && stage !== job.stage) {
      job.stage = stage;
      job.done = 0;
      job.total = 0;
    }
    if (total !== undefined) job.total = total;
    if (done !== undefined) job.done = done;
  };
}

export function finishImportJob(job: ImportJob, summary: ImportSummary) {
  job.status = "done";
  job.stage = "Finished";
  job.summary = summary;
  job.finishedAt = Date.now();
}

export function failImportJob(job: ImportJob, error: string) {
  job.status = "failed";
  job.error = error;
  job.finishedAt = Date.now();
}
