"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ADVANCE_MS = 6000;
/** How long to leave autoplay alone after the viewer touches the carousel. */
const RESUME_MS = 10_000;

/**
 * Mobile carousel for the trending top three: swipeable, auto-advancing in a
 * loop, with dots. Interacting with it pauses autoplay for a while rather than
 * for good, so it does not fight you but does come back.
 */
export function SpotlightCarousel({ children }: { children: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [interactedAt, setInteractedAt] = useState<number | null>(null);

  /** Index of the slide whose centre is nearest the scrollport's centre. */
  const currentIndex = useCallback((el: HTMLElement) => {
    const centre = el.scrollLeft + el.clientWidth / 2;

    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const slide = el.children[i] as HTMLElement;
      const slideCentre = slide.offsetLeft + slide.offsetWidth / 2 - el.offsetLeft;
      const gap = Math.abs(slideCentre - centre);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    return best;
  }, []);

  const scrollToSlide = useCallback((next: number) => {
    const el = ref.current;
    if (!el) return;

    const slide = el.children[next] as HTMLElement | undefined;
    if (!slide) return;

    // Measured against the track, not multiplied out from a slide width: the
    // gap and scroll padding make width-based maths drift after a slide or two.
    el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => setIndex(currentIndex(el));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentIndex]);

  useEffect(() => {
    // A vertical page scroll that happens to start on the carousel fires
    // pointerdown too, so a pause has to expire on its own.
    if (interactedAt !== null && Date.now() - interactedAt < RESUME_MS) {
      const wake = setTimeout(() => setInteractedAt(null), RESUME_MS);
      return () => clearTimeout(wake);
    }

    const id = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      scrollToSlide((currentIndex(el) + 1) % el.children.length);
    }, ADVANCE_MS);

    return () => clearInterval(id);
  }, [interactedAt, currentIndex, scrollToSlide]);

  return (
    <div>
      <div
        ref={ref}
        onPointerDown={() => setInteractedAt(Date.now())}
        // The padding is what stops the cards' drop shadows being clipped by
        // the scroll container — `overflow-x: auto` clips the other axis too.
        // It has to clear the shadow's own spread, which is wider than it looks.
        className="-mx-4 -mt-3 -mb-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-5 pb-12 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", scrollPaddingLeft: "1rem" }}
      >
        {children.map((child, i) => (
          <div key={i} className="w-full shrink-0 snap-start">
            {child}
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-center gap-1.5">
        {children.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to item ${i + 1}`}
            aria-current={i === index}
            onClick={() => {
              setInteractedAt(Date.now());
              scrollToSlide(i);
            }}
            className={`h-1.5 touch-manipulation rounded-full transition-all ${
              i === index ? "w-5 bg-flare-400" : "w-1.5 bg-ink-600"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
