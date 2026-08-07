"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * What a viewer sees when a page throws.
 *
 * Nearly always this is TMDB being slow or briefly down, which is temporary and
 * nothing the viewer did — so the copy says so and the first thing offered is
 * "try again". `reset()` re-renders the segment without a full navigation, so a
 * blip costs one button press.
 *
 * The digest is shown but not explained: it is the only thing that ties what
 * happened on screen to a line in the server log, and hiding it helps nobody.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rise grid place-items-center px-6 py-20 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ember-500/15 text-ember-400">
        <TriangleAlert size={22} />
      </span>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">That did not load</h1>
      <p className="mt-1.5 max-w-sm text-sm text-ink-400">
        Something went wrong putting this page together — usually that means TMDB is having a
        moment. It is worth another go.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
        >
          <RefreshCw size={16} />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-ink-600/70 bg-ink-900/70 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:bg-ink-800 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
        >
          Back home
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-ink-600">{error.digest}</p>
      )}
    </div>
  );
}
