"use client";

import { useId } from "react";

/**
 * A slider with a handle at each end.
 *
 * Built out of two native `<input type="range">` stacked on top of each other
 * rather than out of pointer events on a div. That is the only version that
 * arrives with keyboard support, focus rings, touch targets and screen-reader
 * announcements already correct — everything a hand-rolled one spends a hundred
 * lines getting wrong.
 *
 * The trick that makes it work is `pointer-events`: the two inputs overlap
 * completely, so the top one would swallow every press. Both are therefore made
 * transparent to the pointer, and only their thumbs are given it back — which
 * is why the styling below reaches for `::-webkit-slider-thumb` and
 * `::-moz-range-thumb` by hand. The coloured bar between the handles is a plain
 * div underneath, positioned from the values.
 *
 * The handles cannot cross. Pushing one past the other clamps it, rather than
 * swapping them: swapping means the handle under your finger stops being the
 * one that moves, which feels broken even though the numbers come out right.
 */
export function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format = (n) => String(n),
  /** Shown instead of the top figure when the handle is at the ceiling. */
  maxLabel,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  format?: (value: number) => string;
  maxLabel?: string;
}) {
  const id = useId();
  const [low, high] = value;

  const percent = (n: number) => ((n - min) / (max - min)) * 100;

  const thumb =
    "pointer-events-none absolute inset-x-0 top-0 h-9 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white " +
    "[&::-webkit-slider-thumb]:bg-flare-500 [&::-webkit-slider-thumb]:shadow-md " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 " +
    "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full " +
    "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-flare-500 " +
    "focus-visible:outline-none";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-300">{label}</span>
        <span className="font-mono text-xs tabular-nums text-ink-100">
          {format(low)} – {high >= max && maxLabel ? maxLabel : format(high)}
        </span>
      </div>

      <div className="relative mt-2 h-9">
        {/* The rail, and the lit section between the handles. */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-700" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-flare-500"
          style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }}
        />

        <input
          type="range"
          id={`${id}-low`}
          aria-label={`${label}, lower bound`}
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={(event) => onChange([Math.min(Number(event.target.value), high), high])}
          className={thumb}
        />
        <input
          type="range"
          id={`${id}-high`}
          aria-label={`${label}, upper bound`}
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(event) => onChange([low, Math.max(Number(event.target.value), low)])}
          className={thumb}
        />
      </div>
    </div>
  );
}
