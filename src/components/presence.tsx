"use client";

import { cloneElement, createContext, isValidElement, useContext, useEffect, useState, type ReactElement, type ReactNode } from "react";

/*
 * Keeps something mounted long enough to leave. A sheet, menu or toast that
 * unmounted the frame it closed could only ever cut; this holds it for its
 * exit, says which way it is going as `data-state="open" | "closed"`, and
 * leaves the moving to CSS (the `motion-*` utilities in `globals.css`). No
 * animation library and no measuring: the exit's length is told, not read
 * from `animationend`, so a keyframe that never runs (reduced motion, an
 * old browser) cannot leave a closed panel on screen.
 */

export type PresenceState = "open" | "closed";

/** The exits, in milliseconds, matching `--fast` and `--base` in `globals.css`. */
export const EXIT = { fast: 150, base: 250 } as const;

/**
 * Where a presence is after something happens to it, pure so it can be tested
 * without a browser. Opening mounts at once; closing keeps it mounted until
 * the exit has run; an exit that finishes after it was reopened is ignored.
 */
export function presenceAfter(mounted: boolean, event: "open" | "close" | "exited", open: boolean): boolean {
  if (event === "open") return true;
  if (event === "exited") return open;
  return mounted;
}

const ReducedMotion = "(prefers-reduced-motion: reduce)";

/**
 * `mounted` while open or leaving; `state` for the `data-state` attribute.
 * With reduced motion the exit is a cut, so nothing waits.
 */
export function usePresence(open: boolean, exitMs: number = EXIT.base): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open);
  // Opening is known during render, so the panel mounts in the same commit as the press.
  if (open && !mounted) setMounted(presenceAfter(mounted, "open", open));

  useEffect(() => {
    if (open || !mounted) return;
    const cut = typeof matchMedia === "function" && matchMedia(ReducedMotion).matches;
    const timer = setTimeout(() => setMounted(presenceAfter(true, "exited", false)), cut ? 0 : exitMs);
    return () => clearTimeout(timer);
  }, [open, mounted, exitMs]);

  return { mounted: open || mounted, state: open ? "open" : "closed" };
}

const PresenceContext = createContext<PresenceState>("open");

/** What the nearest `Presence` says, for a component that sets `data-state` on its own parts (`Dialog`). */
export function usePresenceState() {
  return useContext(PresenceContext);
}

/**
 * The component form. Its children are what shows while open, and are kept as
 * they last were while it leaves, so `{item && <Sheet item={item} />}` can
 * close on the frame `item` goes to null and still have something to animate
 * out. A single element child also gets `data-state` itself.
 */
export function Presence({
  open,
  exit = EXIT.base,
  children,
}: {
  open: boolean;
  exit?: number;
  children?: ReactNode;
}) {
  const { mounted, state } = usePresence(open, exit);
  const [kept, setKept] = useState<ReactNode>(open ? children : null);
  if (open && kept !== children) setKept(children);
  if (!mounted) return null;

  const shown = open ? children : kept;
  const marked = isValidElement(shown)
    ? cloneElement(shown as ReactElement<{ "data-state"?: PresenceState }>, { "data-state": state })
    : shown;
  return <PresenceContext.Provider value={state}>{marked}</PresenceContext.Provider>;
}
