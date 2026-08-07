"use client";

import Link from "next/link";
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from "@/lib/range";

/**
 * The window everything below is measured over.
 *
 * Links rather than buttons with client state: the range belongs in the URL, so
 * a reload keeps it, the back button steps through it, and the page can stay a
 * server component that simply reads a different slice.
 *
 * `scroll={false}` because the bar is at the top of what it controls — jumping
 * to the top of the page after every press would be motion for nothing.
 */
export function RangeFilter({ active }: { active: RangeKey }) {
  return (
    /**
     * Two boxes rather than one. The frame is the outer element and does not
     * clip; the scroller is inside it. `overflow-x: auto` leaves the vertical
     * axis computing to `auto` too, so a single box would clip the active
     * tab's shadow off at its own edge — the same thing `.rail` pads around in
     * globals.css. Here the padding gives the shadow room inside the scroll
     * box and the matching negative margin takes the height back, so the frame
     * measures exactly as it did before.
     */
    <div
      role="tablist"
      aria-label="Time range"
      className="rounded-2xl border border-ink-800/80 bg-ink-900/40 p-1 backdrop-blur-sm"
    >
      <div
        className="-my-3 flex gap-1 overflow-x-auto py-3 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
      {RANGE_KEYS.map((key) => {
        const current = key === active;

        return (
          <Link
            key={key}
            href={`/profile?range=${key}`}
            scroll={false}
            role="tab"
            aria-selected={current}
            className={`flex-1 rounded-xl px-3 py-2 text-center text-sm whitespace-nowrap transition ${
              current
                ? "bg-flare-600 font-semibold text-white shadow-[0_8px_20px_-10px] shadow-flare-600/80"
                : "text-ink-300 hover:bg-ink-800/70 hover:text-ink-100"
            }`}
          >
            {RANGE_LABELS[key]}
          </Link>
        );
      })}
      </div>
    </div>
  );
}
