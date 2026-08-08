"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

/**
 * Previous, Next, and the page number you can type into.
 *
 * Every listing that pages keeps the page in the URL, so the two arrows are
 * ordinary anchors and a link to page forty is a link like any other. What was
 * missing was a way to *get* to page forty without pressing Next thirty-nine
 * times — hence the middle, which is the "N / M" label the three pages already
 * showed, made editable in place rather than grown into a row of numbered
 * buttons that would not fit a phone.
 *
 * Shared because the three listings had a copy of this each and had already
 * drifted apart in styling and in wording.
 */

/** TMDB stops answering past here, and every caller already clamps to it. */
const MAX_PAGE = 500;

export function Pager({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  /** The listing's own path, e.g. `/discover/popular-movies`. */
  basePath: string;
  /**
   * Everything else in the query string — the genre's type filter, the browse
   * page's whole filter set — carried through so paging never quietly drops a
   * filter. A plain object rather than a function building the href, because a
   * server component cannot hand a function to a client one.
   */
  params?: Record<string, string>;
}) {
  const router = useRouter();
  const ceiling = Math.min(totalPages, MAX_PAGE);

  const [draft, setDraft] = useState(String(page));

  /**
   * Whatever is in the box belongs to the page it was typed on, and Previous or
   * Next moves the page without going near it — so the box has to be reseeded
   * when the page changes underneath it.
   *
   * Adjusted during the render rather than in an effect: this is state derived
   * from a prop, and React re-runs the render before touching the DOM, so the
   * stale number is never painted. An effect would show it for a frame and cost
   * a second pass to take it away again.
   */
  const [seededFor, setSeededFor] = useState(page);
  if (seededFor !== page) {
    setSeededFor(page);
    setDraft(String(page));
  }

  const href = (next: number) => {
    const query = new URLSearchParams(params);
    // Page one is the bare address, which is what the listings already produced
    // and what anybody copying a link out of the bar expects to see.
    if (next > 1) query.set("page", String(next));
    const qs = query.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const go = () => {
    const wanted = Number(draft);
    if (!Number.isFinite(wanted)) return setDraft(String(page));

    // Clamped rather than refused: somebody typing 900 into a 400-page list
    // means "the end", and an error message would be a strange answer to that.
    const next = Math.min(Math.max(Math.trunc(wanted), 1), ceiling);
    setDraft(String(next));
    if (next !== page) router.push(href(next));
  };

  return (
    <nav className="mt-10 flex items-center justify-center gap-3">
      <Step href={href(page - 1)} disabled={page <= 1} label="Previous" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex items-center gap-1.5 font-mono text-sm text-ink-400 tabular-nums"
      >
        <label className="sr-only" htmlFor="pager-page">
          Page number
        </label>
        <input
          id="pager-page"
          // `text` rather than `number`: the spinners are useless at this size,
          // and a number field reports an empty string for anything it considers
          // half-typed, which loses the value mid-edit.
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onFocus={(e) => e.target.select()}
          onBlur={go}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(String(page));
              e.currentTarget.blur();
            }
          }}
          aria-label={`Page ${page} of ${totalPages}`}
          className="w-12 rounded-lg border border-ink-700 bg-ink-900/70 px-2 py-1 text-center text-sm text-ink-100 outline-none transition focus:border-flare-500 light:bg-white/85"
        />
        <span>/ {totalPages}</span>
      </form>

      <Step href={href(page + 1)} disabled={page >= ceiling} label="Next" />
    </nav>
  );
}

function Step({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: "Previous" | "Next";
}) {
  const Icon = label === "Previous" ? ChevronLeft : ChevronRight;

  const content = (
    <>
      {label === "Previous" && <Icon size={15} />}
      {label}
      {label === "Next" && <Icon size={15} />}
    </>
  );

  // Rendered as a dead span rather than a disabled link: there is nowhere to go,
  // and an anchor to the page you are on is a promise the browser would keep.
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl border border-ink-800 px-4 py-2 text-sm text-ink-600">
        {content}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 px-4 py-2 text-sm text-ink-100 transition hover:border-flare-500 hover:bg-ink-800"
    >
      {content}
    </Link>
  );
}
