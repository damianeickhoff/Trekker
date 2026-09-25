"use client";

import { Children, useState, type ReactNode } from "react";
import { feedFold } from "@/lib/news-chips";
import { buttonClass } from "../ui";

/**
 * The feed's grid, thirty cards at a time (Round 10 review): a chip can hold
 * well over a hundred headlines, which on a phone is a page tens of
 * thousands of pixels tall. The rows are already read and drawn by the
 * server; this only folds them, so Show more makes no request. The parent
 * keys it by chip and channel, so a new choice starts folded again.
 */
export function FeedFold({ className, children }: { className: string; children: ReactNode }) {
  const [presses, setPresses] = useState(0);
  const cards = Children.toArray(children);
  const { shown, next } = feedFold(cards.length, presses);
  return (
    <>
      <div className={className}>{cards.slice(0, shown)}</div>
      {next > 0 && (
        <button type="button" onClick={() => setPresses((p) => p + 1)} className={buttonClass("ghost", "sm", "self-center")}>
          Show {next} more
        </button>
      )}
    </>
  );
}
