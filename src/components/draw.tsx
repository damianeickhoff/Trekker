"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

/*
 * Things that draw themselves the first time they are seen, once per visit:
 * a badge's ring, the badges page's bars, the profile's charts. The drawing
 * is CSS (`draw-*` in `globals.css`): what is inside a `DrawOnView` starts
 * at nothing (an empty arc, a bar at zero, a line not yet drawn) and eases to
 * the value the server already wrote into it once the box has come into
 * view. The empty start exists only where script runs and motion is welcome,
 * so without either the value is simply there, and nothing waits on this to
 * be right.
 *
 * One IntersectionObserver for the whole page, shared by every box, rather
 * than one each: a badges page has a hundred rings.
 */

type Seen = () => void;
const waiting = new Map<Element, Seen>();
let observer: IntersectionObserver | null = null;

function watch(el: Element, onSeen: Seen) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer!.unobserve(e.target);
        waiting.get(e.target)?.();
        waiting.delete(e.target);
      }
    },
    // A little before the fold, so the drawing is under way as it is read.
    { rootMargin: "0px 0px -8% 0px" },
  );
  waiting.set(el, onSeen);
  observer.observe(el);
  return () => {
    waiting.delete(el);
    observer?.unobserve(el);
  };
}

/** `true` from the first time the element is in view, for the rest of the visit. */
export function useFirstView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    return watch(el, () => setSeen(true));
  }, [seen]);
  return [ref, seen] as const;
}

/**
 * A box whose `draw-*` contents draw on first view: `data-draw` always,
 * `data-seen` from the first time it is on screen.
 */
export function DrawOnView({
  children,
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  as?: "div" | "span" | "section" | "ol" | "ul";
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  const [ref, seen] = useFirstView<HTMLElement>();
  return (
    <Tag
      {...rest}
      // A union of intrinsic elements has no single ref type; each of these is an HTMLElement.
      ref={ref as never}
      data-draw=""
      data-seen={seen ? "" : undefined}
    >
      {children}
    </Tag>
  );
}
