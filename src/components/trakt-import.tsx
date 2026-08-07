"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BusyBar } from "./ui";

/**
 * Running a Trakt import, and watching it go.
 *
 * The import is a job on the server now rather than the body of a request — see
 * `lib/import-jobs` for why — so this is the other half of that: it starts one,
 * then asks how it is going until it stops. Which means it can finally say
 * something true about a run that takes minutes. "Matching film 50 of 200" is
 * the difference between waiting and wondering whether anything is happening.
 *
 * It also picks up a run it did not start. Opening settings while an import is
 * going — after a reload, or after the installed app was backgrounded long
 * enough for iOS to throw the page away — finds it and carries on watching,
 * because the work never belonged to the tab in the first place.
 */

type Summary = { movies: number; episodes: number; updated: number; skipped: number };

type Job = {
  id: string;
  status: "running" | "done" | "failed";
  stage: string;
  done: number;
  total: number;
  error?: string;
  summary?: Summary;
};

/** Often enough to feel live, rarely enough to be nothing on a phone battery. */
const POLL_MS = 1200;

export function useTraktImport() {
  const [job, setJob] = useState<Job | null>(null);
  /** Something the start request itself refused, before any job existed. */
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  // So the poll can tell "it just finished" from "it was already finished when
  // this page loaded" — only the first of those is worth a refresh.
  const watching = useRef<string | null>(null);

  /**
   * Reads a job and reports nothing to React on its own. Setting state is left
   * to the callers so that both of the effects below stay what they look like —
   * a subscription to something outside React that updates state when the
   * outside thing changes, rather than a render that triggers another render.
   */
  const fetchJob = useCallback(async (id?: string) => {
    const response = await fetch(
      id ? `/api/import/trakt?job=${encodeURIComponent(id)}` : "/api/import/trakt",
    ).catch(() => null);
    if (!response?.ok) return null;

    const { job: next } = (await response.json()) as { job: Job | null };
    return next;
  }, []);

  // Rejoin anything already running for this account.
  useEffect(() => {
    let live = true;

    void fetchJob().then((found) => {
      if (!live || !found) return;
      if (found.status === "running") watching.current = found.id;
      setJob(found);
    });

    return () => {
      live = false;
    };
  }, [fetchJob]);

  useEffect(() => {
    if (job?.status !== "running") return;

    const id = job.id;
    watching.current = id;

    const timer = setInterval(() => {
      void fetchJob(id).then((next) => {
        if (!next) return;
        setJob(next);
        if (next.status === "running") return;

        /**
         * The pages behind this one are all out of date the moment an import
         * lands — the history, the calendar, every count on the profile. The
         * run itself cannot say so: it finishes long after the request that
         * started it was answered, and there is no longer a response to attach
         * a revalidation to. Asking from here is the same invalidation, made by
         * the one party still around to make it.
         */
        if (watching.current === id) {
          watching.current = null;
          router.refresh();
        }
      });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [job?.status, job?.id, fetchJob, router]);

  const start = useCallback(
    async (body?: FormData) => {
      setStarting(true);
      setError(null);
      setJob(null);

      try {
        const response = await fetch("/api/import/trakt", { method: "POST", body });
        const data = (await response.json().catch(() => ({}))) as {
          job?: Job;
          error?: string;
        };

        if (!response.ok || !data.job) {
          setError(data.error ?? "The import could not be started");
          return;
        }

        setJob(data.job);
      } catch {
        setError("Could not reach the server");
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  return {
    job,
    error: error ?? (job?.status === "failed" ? (job.error ?? "The import failed") : null),
    /** True from the press until the server has a job to report on. */
    starting,
    running: starting || job?.status === "running",
    summary: job?.status === "done" ? job.summary : undefined,
    start,
  };
}

/**
 * Where an import has got to.
 *
 * Determinate whenever the server knows the size of the stage it is in, and the
 * sweeping bar otherwise — a stage like "writing episodes" is a single bulk
 * call with no position to report, and a bar inventing one would be a lie the
 * reader has no way to check.
 */
export function ImportProgress({ job, starting }: { job: Job | null; starting: boolean }) {
  if (starting || !job) return <BusyBar label="Reading the export…" />;

  const { stage, done, total } = job;
  if (total <= 0) return <BusyBar label={`${stage}…`} />;

  const percent = Math.min(100, Math.round((done / total) * 100));

  return (
    <div role="status" aria-live="polite" className="w-full">
      <p className="mb-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-400">
        <span>{stage}…</span>
        <span className="font-mono tabular-nums">
          {done} of {total}
        </span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ImportSummary({
  summary,
  error,
}: {
  summary?: Summary;
  error?: string | null;
}) {
  if (error) {
    return (
      <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error}
      </p>
    );
  }
  if (!summary) return null;

  return (
    <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
      Imported {summary.movies} movie{summary.movies === 1 ? "" : "s"} and {summary.episodes}{" "}
      episode{summary.episodes === 1 ? "" : "s"}
      {summary.updated > 0 &&
        ` · ${summary.updated} date${summary.updated === 1 ? "" : "s"} corrected`}
      {summary.skipped > 0 && ` · ${summary.skipped} skipped`}.
    </p>
  );
}
