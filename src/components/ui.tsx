import Link from "next/link";
import { Eye } from "lucide-react";
import { formatWatchedShort } from "@/lib/dates";

/**
 * "👁 3 Aug ’26 · 2×".
 *
 * The one way the app says you have seen something and when. It started on the
 * episode page and is now on every row of a season as well, which is exactly
 * why it is a component rather than a class list copied twice: two chips saying
 * the same thing in two slightly different greens is worse than either.
 *
 * The eye is the word. "Watched" in front of the date was the icon said twice,
 * and it was the longest part of a chip that has to sit inline beside an episode
 * title — so the glyph carries the meaning and the date gets the room. Screen
 * readers still hear the word, because an eye is not one.
 *
 * The count only appears once it is more than one. "1×" is what the pill
 * already means.
 */
export function WatchedPill({
  at,
  plays = 1,
  /** Sized down for a list row, where the pill sits beside a title rather than
      on a line of its own. */
  compact = false,
}: {
  at: Date | string;
  plays?: number;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-fresh-500/40 bg-fresh-500/10 font-medium whitespace-nowrap text-fresh-500 ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      <Eye size={compact ? 11 : 12} className="shrink-0" />
      <span className="sr-only">Watched </span>
      {formatWatchedShort(at)}
      {plays > 1 && <span className="font-mono tabular-nums">· {plays}×</span>}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`card p-3 sm:p-4 ${
        accent ? "bg-gradient-to-br from-flare-600/25 to-transparent" : ""
      }`}
    >
      <p className="flex items-start gap-1.5 text-[11px] leading-tight font-medium tracking-wide text-ink-400 uppercase sm:tracking-wider">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

/**
 * Busy indicator for work that runs server-side in one call. There is no honest
 * percentage to show for that, so it sweeps rather than fills.
 */
export function BusyBar({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="w-full">
      {label && <p className="mb-1.5 text-xs text-ink-400">{label}</p>}
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className="progress-sweep h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400" />
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  href,
  cta = "See all",
}: {
  children: React.ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="mt-8 mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {href && (
        <Link href={href} className="text-sm text-flare-400 hover:text-flare-500">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="card grid place-items-center px-6 py-12 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-400">{body}</p>
      {href && cta && (
        <Link
          href={href}
          className="mt-5 rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-flare-500"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

/**
 * Placeholders for content still on its way.
 *
 * Every page here fetches TMDB while it renders, so a slow answer used to mean
 * a blank screen and no sign that anything was happening. These stand in for
 * the shape that is coming rather than showing a spinner: the layout does not
 * jump when the real thing lands, which is the whole point of drawing them.
 *
 * The shimmer is a background animation on a plain block. Under
 * `prefers-reduced-motion` the keyframes are dropped in `globals.css` and these
 * settle into flat blocks, which read perfectly well as "not here yet".
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-lg ${className}`} />;
}

export function SkeletonRail({ count = 6, label }: { count?: number; label?: string }) {
  return (
    <section className="mt-8" role="status" aria-label={label ?? "Loading"}>
      <Skeleton className="mb-3 h-6 w-44" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="w-[152px] shrink-0 sm:w-[184px]">
            <Skeleton className="aspect-2/3 w-full rounded-xl" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-1 h-3 w-2/5" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-2/3 w-full rounded-xl" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-8 w-24" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SetupNotice() {
  return (
    <div className="card border-ember-500/30 bg-ember-500/10 p-5">
      <h3 className="text-base font-semibold text-ember-400">Add a TMDB API key</h3>
      <p className="mt-1.5 text-sm text-ink-300">
        Trekker pulls catalogue data, artwork, scores and reviews from{" "}
        <a
          className="text-flare-400 underline underline-offset-2"
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noreferrer"
        >
          The Movie Database
        </a>
        . Put a free key in <code className="font-mono text-xs">.env</code> as{" "}
        <code className="font-mono text-xs">TMDB_API_KEY</code> and restart the dev server.
      </p>
    </div>
  );
}
