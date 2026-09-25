"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { TickMark } from "../artwork";

/**
 * The confirmation over a poster when its episode is marked watched: the tick
 * scales in over the artwork, holds and fades, two seconds in all, and with
 * reduced motion it fades without the scale (`.tick-flash` in `globals.css`).
 * One of the two pieces of motion on Home, both feedback for something just
 * done.
 *
 * The button and the poster are apart in the markup, and the poster is drawn
 * on the server, so a scope around the row carries the signal between them.
 * The overlay is keyed by a counter: every tick plays it afresh, and it stays
 * where it is when the row re-renders with the next episode underneath.
 */

const FlashContext = createContext<{ count: number; flash: () => void }>({ count: 0, flash: () => {} });

export function TickScope({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const flash = useCallback(() => setCount((n) => n + 1), []);
  const value = useMemo(() => ({ count, flash }), [count, flash]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useTickFlash() {
  return useContext(FlashContext).flash;
}

/** Drawn inside the poster's positioned wrapper; nothing until the first tick. */
export function TickFlash({ size }: { size: number }) {
  const { count } = useContext(FlashContext);
  if (count === 0) return null;
  return (
    <span
      key={count}
      aria-hidden="true"
      className="tick-flash pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35"
    >
      <TickMark on onArt size={size} />
    </span>
  );
}
