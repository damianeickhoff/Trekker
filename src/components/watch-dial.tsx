"use client";

import { Check } from "lucide-react";

/**
 * How much of something has been watched, as a filled wedge.
 *
 * It replaces a ring that was either empty or ticked, which could only say
 * "started" or "finished" — on a season you are eight episodes into, both of
 * those are wrong. A pie says the one thing the control is actually about
 * without a number beside it, and at this size a number would not fit anyway.
 *
 * Drawn as a stroke rather than as a path. A circle whose stroke is as wide as
 * its own diameter fills from the centre outwards, so the usual
 * `stroke-dasharray` trick — the one that draws an arc — draws a wedge instead,
 * and animates just as smoothly. An arc path would have needed trigonometry and
 * a `d` attribute rebuilt on every render to do the same thing.
 */

/** The wedge's radius, and the geometry that follows from it. */
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function WatchDial({
  watched,
  total,
  busy,
}: {
  watched: number;
  total: number;
  /** Something is in flight; the dial holds its last value rather than jumping. */
  busy?: boolean;
}) {
  const share = total > 0 ? Math.min(1, Math.max(0, watched / total)) : 0;
  const complete = total > 0 && watched >= total;

  return (
    <span
      className={`relative grid h-7 w-7 place-items-center rounded-full border transition-colors duration-300 ${
        complete
          ? "border-white/25 bg-white/85 text-neutral-900 light:border-neutral-900 light:bg-neutral-900 light:text-white"
          : "border-white/20 bg-black/50 text-white light:border-ink-600 light:bg-white light:text-ink-100"
      } ${busy ? "opacity-60" : ""}`}
    >
      {/* The wedge fades out as the tick fades in, so a season being completed
          reads as one movement rather than as a swap. */}
      <svg
        viewBox="0 0 32 32"
        aria-hidden
        className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${
          complete ? "opacity-0" : "opacity-100"
        }`}
      >
        <circle
          cx="16"
          cy="16"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RADIUS * 2}
          strokeDasharray={CIRCUMFERENCE}
          // Counted from a full circle, so 0% is a completely hidden stroke.
          strokeDashoffset={CIRCUMFERENCE * (1 - share)}
          // From twelve o'clock, the way a clock face and every other progress
          // dial people have seen fills.
          transform="rotate(-90 16 16)"
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>

      <Check
        size={13}
        className={`relative transition-all duration-300 ${
          complete ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
      />
    </span>
  );
}
