import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Several pages call `notFound()` for a title TMDB does not have, or an id that
 * is not a number. Until now every one of those fell through to the framework
 * default, which is a bare black page with no way back.
 */
export default function NotFound() {
  return (
    <div className="rise grid place-items-center px-6 py-20 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-flare-600/15 text-flare-400">
        <Compass size={22} />
      </span>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-1.5 max-w-sm text-sm text-ink-400">
        This page does not exist, or the title behind it is not on TMDB any more.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          href="/discover"
          className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
        >
          Browse something else
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-ink-600/70 bg-ink-900/70 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:bg-ink-800 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
