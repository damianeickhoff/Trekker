"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EXIT } from "./presence";

/**
 * One thing giving way to the next in the same place: the Up next card's
 * episode after Mark watched. `id` says which thing it is; when it changes
 * after mount, the old one leaves and the new one arrives. Nothing moves on
 * first paint, since the first `id` is simply shown, and with reduced motion
 * the change is a cut.
 *
 * `sequence` (the card's text): the old fades out over `--fast`, then the new
 * fades in rising 6px over `--base` (`motion-swap-out`, `motion-swap-in`).
 * `crossfade` (the card's poster, when the show changes): the new is drawn at
 * once and the old, laid over it, fades away over `--base`
 * (`motion-swap-over`), so there is never a gap between the two pictures.
 * `stack` (a season's episodes): both stand in one grid cell; the old fades
 * over `--fast` and then its row closes over `--base` (`motion-collapse`),
 * while the new one's row opens and it fades in rising 6px over `--base`
 * (`motion-swap-grow`). The cell is as tall as the taller of the two as they
 * move, so the height changes by `grid-template-rows` and the page under the
 * list slides rather than jumps.
 */
export function Swap({
  id,
  mode = "sequence",
  className = "",
  children,
}: {
  id: string;
  mode?: "sequence" | "crossfade" | "stack";
  className?: string;
  children?: ReactNode;
}) {
  const [current, setCurrent] = useState(id);
  const [last, setLast] = useState<ReactNode>(children);
  const [old, setOld] = useState<{ id: string; node: ReactNode } | null>(null);
  const [arrived, setArrived] = useState(false);

  if (id !== current) {
    const cut = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    setOld(cut ? null : { id: current, node: last });
    setArrived(!cut);
    setCurrent(id);
    setLast(children);
  } else if (children !== last) {
    setLast(children);
  }

  const leaving = old?.id;
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setOld(null), mode === "sequence" ? EXIT.fast : mode === "stack" ? EXIT.fast + EXIT.base : EXIT.base);
    return () => clearTimeout(timer);
  }, [leaving, mode]);

  if (mode === "sequence") {
    // The old keeps its key, so it is the same element fading, not a copy.
    if (old)
      return (
        <div key={old.id} className={`motion-swap-out ${className}`}>
          {old.node}
        </div>
      );
    return (
      <div key={current} className={[arrived && "motion-swap-in", className].filter(Boolean).join(" ") || undefined}>
        {children}
      </div>
    );
  }

  if (mode === "stack") {
    const layer = "grid grid-rows-[1fr] [grid-area:1/1]";
    return (
      <div className={`grid ${className}`}>
        <div key={current} className={`${layer} ${arrived ? "motion-swap-grow" : ""}`}>
          <div className="min-h-0">{children}</div>
        </div>
        {old && (
          <div key={old.id} aria-hidden="true" data-state="closed" className={`motion-collapse ${layer}`}>
            <div className="min-h-0">{old.node}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <span className={`relative block ${className}`}>
      <span key={current} className="block">
        {children}
      </span>
      {old && (
        <span key={old.id} aria-hidden="true" className="motion-swap-over absolute inset-0 block">
          {old.node}
        </span>
      )}
    </span>
  );
}
