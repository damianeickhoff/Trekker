"use client";

import { Children, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";

/*
 * A list whose rows collapse when they leave because of something the person
 * did: Also waiting after Mark watched takes a show's last episode. The row
 * fades over `--fast`, then its grid row shrinks to nothing over `--base`
 * (`motion-collapse` in `globals.css`), so the rows below slide up rather
 * than jump. A row that leaves while nobody has pressed anything lately (the
 * warm launch's refresh bringing the list up to date) is simply gone, as is
 * everything with reduced motion.
 *
 * Arrivals are the other half: a row that turns up because of a press (a
 * comment just posted) fades and rises in (`motion-rise-in`); one that
 * turns up any other way, and every row on first paint, is simply there.
 */

/** How long a leaving row stays: its fade and then its collapse, `--fast` plus `--base`. */
export const COLLAPSE_MS = 150 + 250;

/** A press counts as the reason for a row leaving for this long; a server answer comes well within it. */
const PRESS_WINDOW_MS = 8000;

type Entry<T> = { key: string; value: T; leaving: boolean };

/**
 * The rows to draw: the new ones, in order, with each row that has gone kept
 * after the row it followed, marked leaving. Pure, so it can be tested
 * without a browser. Without `animate`, gone rows are simply dropped.
 */
export function withLeaving<T>(previous: Entry<T>[], next: { key: string; value: T }[], animate: boolean): Entry<T>[] {
  const out: Entry<T>[] = next.map((n) => ({ ...n, leaving: false }));
  if (!animate) return out;
  const staying = new Set(next.map((n) => n.key));
  previous.forEach((p, i) => {
    if (staying.has(p.key)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const found = out.findIndex((o) => o.key === previous[j].key);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    out.splice(at, 0, { ...p, leaving: true });
  });
  return out;
}

// When the page last took a press, for every list on it.
let lastPress = -Infinity;
let listening = 0;
const onPress = () => {
  lastPress = performance.now();
};

function pressedLately() {
  return (
    performance.now() - lastPress < PRESS_WINDOW_MS &&
    !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

/**
 * For a list of its own that wants to know whether a change came from a
 * press (a list's grid of posters): listens while mounted, and answers as
 * `ExitList` does.
 */
export function useRecentPress() {
  useEffect(() => {
    if (listening++ === 0) document.addEventListener("pointerdown", onPress, true);
    return () => {
      if (--listening === 0) document.removeEventListener("pointerdown", onPress, true);
    };
  }, []);
  return pressedLately;
}

function entriesOf(children: ReactNode) {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((child) => ({ key: String((child as ReactElement).key), value: child as ReactElement }));
}

/** The keys in `next` that `previous` did not have: the rows arriving. Pure, like `withLeaving`. */
export function arrivals(previous: { key: string }[], next: { key: string }[]): Set<string> {
  const had = new Set(previous.map((p) => p.key));
  return new Set(next.filter((n) => !had.has(n.key)).map((n) => n.key));
}

/**
 * Renders a `ul` of `li`s, one per keyed child, each a one-row grid whose
 * `min-h-0` body holds the child. The gap between rows is the body's own
 * bottom padding (`gap`), so it collapses with the row rather than standing
 * on after it.
 */
export function ExitList({
  children,
  label,
  className = "",
  gap = "pb-2",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  gap?: string;
}) {
  const [from, setFrom] = useState(children);
  const [entries, setEntries] = useState(() => withLeaving([], entriesOf(children), false));
  // Rows that arrived after a press, for as long as they are on the list: the class only plays as the row mounts.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  if (from !== children) {
    const next = entriesOf(children);
    const pressed = pressedLately();
    setFrom(children);
    setEntries(withLeaving(entries, next, pressed));
    if (pressed) {
      const fresh = arrivals(entries, next);
      if (fresh.size) setArrived(new Set([...arrived, ...fresh]));
    }
  }

  useRecentPress();

  const leaving = entries.filter((e) => e.leaving).map((e) => e.key).join(" ");
  useEffect(() => {
    if (!leaving) return;
    const gone = new Set(leaving.split(" "));
    const timer = setTimeout(() => setEntries((now) => now.filter((e) => !(e.leaving && gone.has(e.key)))), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <ul aria-label={label} className={`m-0 list-none p-0 ${className}`}>
      {entries.map((e, i) => (
        // `minmax(0, 1fr)` and `min-w-0`: a grid track and its item both size to their content's
        // widest line unless told otherwise, and a row's long episode name would push the list
        // past the viewport instead of truncating.
        <li
          key={e.key}
          data-state={e.leaving ? "closed" : "open"}
          className={`motion-collapse grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[1fr] ${arrived.has(e.key) && !e.leaving ? "motion-rise-in" : ""}`}
        >
          <div className={`min-h-0 min-w-0 ${i < entries.length - 1 ? gap : ""}`}>{e.value}</div>
        </li>
      ))}
    </ul>
  );
}
