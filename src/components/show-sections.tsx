"use client";

import { useSyncExternalStore } from "react";

/**
 * The two halves of a show page — split into tabs on a phone, stacked as they
 * always were on desktop.
 *
 * A show is two different questions asked of the same title: "what is this?" and
 * "where am I in it?". On a phone the second one always lost, sitting below a
 * synopsis, a trailer, a cast rail and two sets of reviews — a long way to
 * scroll to answer "what do I put on next". Desktop has the room to show both at
 * once and never had the problem, so it keeps the single column, in its original
 * order: the episodes first, everything about the show underneath.
 *
 * Which is why the switch is CSS rather than a branch on width. Both halves are
 * rendered either way; on a phone the one you are not looking at is hidden, and
 * on desktop neither is. A JavaScript branch would have to guess the width
 * before hydration and would flash the wrong half on the way to being right.
 */

const KEY = "trekker:show-tab";
type Tab = "details" | "episodes";

/**
 * Which half was last open, kept across titles and across reloads.
 *
 * Someone working through a series opens show after show to the same question,
 * and being put back on Details each time is a tap they did not ask for. It
 * lives in `localStorage` rather than in the URL because it is a preference
 * about how you read the app, not a property of the page you are on — a link
 * to a show should not carry your tab with it.
 *
 * An external store rather than state, for the reason `useOrigin` gives: the
 * value is shared, outlives any one component, and changes from outside the
 * render.
 */
let current: Tab = "details";
let restored = false;
const listeners = new Set<() => void>();

function setTab(next: Tab) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private mode, or storage full. The choice still holds for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  // The first subscriber is the first render on the client, which is the
  // earliest moment `localStorage` can be read without breaking hydration.
  if (!restored) {
    restored = true;
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "details" || stored === "episodes") current = stored;
    } catch {
      // Nothing stored; the default stands.
    }
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useTab() {
  // The server has no storage, so it always renders Details — and the client's
  // first paint has to agree with it or hydration complains.
  return useSyncExternalStore(
    subscribe,
    () => current,
    (): Tab => "details",
  );
}

export function ShowSections({
  details,
  episodes,
}: {
  details: React.ReactNode;
  episodes: React.ReactNode;
}) {
  const tab = useTab();

  return (
    <div className="flex flex-col">
      {/*
        A segmented control rather than two tabs with an underline: this is a
        choice between two views of the same page, which is what a segment says,
        and it reads at a glance where an underline is a hairline.
      */}
      <div
        role="tablist"
        aria-label="Show sections"
        className="ios-surface mt-5 grid grid-cols-2 gap-0.5 rounded-xl border border-ink-700/60 bg-ink-900/50 p-0.5 sm:hidden light:bg-ink-800/70"
      >
        {(["details", "episodes"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-[0.6rem] px-3 py-1.5 text-sm font-semibold capitalize transition ${
              tab === value
                ? // A literal dark rather than a step of the ink ramp: the pill
                  // is white in both themes, and the ramp inverts — `ink-950`
                  // would have been near-white on white in the light one.
                  "bg-white/90 text-neutral-900 shadow-sm"
                : // Dimmed white rather than a step of the ink ramp: those are
                  // violet-greys, and nothing on a phone's title page is meant
                  // to carry a hue that is not the film's.
                  "ios-dim text-ink-300 hover:text-ink-100"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {/* `order` puts the episodes first on desktop, which is where they have
          always been. On a phone only one of the two is on screen, so the order
          between them never comes up. */}
      <div
        role="tabpanel"
        className={`sm:order-2 ${tab === "details" ? "" : "max-sm:hidden"}`}
      >
        {details}
      </div>

      <div
        role="tabpanel"
        className={`sm:order-1 ${tab === "episodes" ? "" : "max-sm:hidden"}`}
      >
        {episodes}
      </div>
    </div>
  );
}
