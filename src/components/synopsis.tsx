"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The synopsis, clamped to a few lines with a control that opens it in place.
 *
 * It used to truncate to a measured character count and put the rest behind a
 * modal. Opening a dialog to read three more sentences was a heavy answer to a
 * light question, and the measuring — a binary search against an off-screen
 * copy — existed only to fit the word "Read more" onto the last line. Expanding
 * in place needs neither: the clamp does the shortening, and the control sits
 * under the text where it has room to say which direction it goes in.
 *
 * The hero row grows to take the expanded text on desktop. That is why the
 * poster beside it is a fixed height rather than the height of the row.
 */

export function Synopsis({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  /** Whether there is anything hidden to open — false hides the control. */
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      if (!element.isConnected) return;
      // Asked of the clamped element, so it has to be read while collapsed —
      // once expanded the two heights are equal and it would answer "no".
      setClipped((was) => (open ? was : element.scrollHeight > element.clientHeight + 1));
    };

    // Web fonts change every measurement, so wait for them before trusting one.
    void (document.fonts?.ready ?? Promise.resolve()).then(measure);

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);

    return () => observer?.disconnect();
  }, [text, open]);

  return (
    <div className="max-w-2xl">
      <p
        ref={ref}
        id="synopsis-text"
        // Spelled out rather than built from a constant: Tailwind reads the
        // source for class names and never sees an interpolated one.
        className={`ios-dim text-sm text-ink-200 ${open ? "" : "line-clamp-4"}`}
      >
        {text}
      </p>

      {clipped && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="synopsis-text"
          className="ios-link mt-1 text-sm font-medium text-flare-400 transition hover:text-flare-500"
        >
          {open ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
