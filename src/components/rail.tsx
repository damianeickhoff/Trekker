"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Poster } from "./poster";

/**
 * A horizontal row of artwork. One IntersectionObserver per rail decides when
 * its images start loading, all at once, as the rail comes near the screen;
 * nothing observes the tiles themselves, and nothing measures them. Until then
 * each tile is its own shaded block, so the row keeps its shape. Nothing fades
 * in: an image shows on the frame it arrives.
 *
 * On phones the rail bleeds to the screen edge, as the mockups draw it, and
 * snaps (`x proximity`, each card's left edge to the 20px gutter), so a flick
 * comes to rest on a card rather than across one; proximity rather than
 * mandatory, so a slow drag still stops where it is let go.
 * `cards` is the standard poster and wide card rail (`poster-card.tsx`), whose
 * cards stand 9px apart, as the old app spaced them; everything else keeps the
 * 12px gap.
 */

const RailVisible = createContext(true);

export function Rail({
  children,
  label,
  className = "",
  cards = false,
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  cards?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // A screen's height of warning: the images are small and cached by the
      // worker, and a rail that pops in under the thumb is worse than a few KB.
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <RailVisible.Provider value={visible}>
      <div
        ref={ref}
        role={label ? "list" : undefined}
        aria-label={label}
        className={`no-scrollbar -mx-5 flex snap-x snap-proximity scroll-px-5 overflow-x-auto px-5 *:snap-start lg:mx-0 lg:-my-3 lg:snap-none lg:px-0 lg:py-3 ${cards ? CARD_RAIL : "gap-3"} ${className}`}
      >
        {children}
      </div>
    </RailVisible.Provider>
  );
}

/**
 * The poster system's rail, its cards 9px apart. Every rail's artwork deepens
 * its shadow on a hover (`ZOOM_SHADOW`), and a scroller clips both ways, so
 * every rail carries 12px of room above and below from `lg`, with a negative
 * margin to match: the shadow shows, and nothing around the rail moves.
 */
const CARD_RAIL = "gap-(--card-gap)";

/**
 * A poster inside a rail: drawn once the rail says so. Outside a rail, at once.
 * A title with no artwork has nothing to load, so its placeholder shows at once.
 */
export function RailImage(props: Parameters<typeof Poster>[0]) {
  const visible = useContext(RailVisible);
  if (!visible && props.path) return <span aria-hidden="true" className={`block shrink-0 bg-surface-2 ${props.className ?? ""}`} />;
  return <Poster {...props} />;
}

/**
 * A backdrop at TMDB's w780, the one size a wide card asks for at both widths
 * (318px at twice the density is 636). Asked for by name rather than through
 * the loader's srcset, which is built for posters and would offer w342 to a
 * phone. Gated on the rail like `RailImage`.
 */
export function RailBackdrop({ path, className = "" }: { path: string; className?: string }) {
  const visible = useContext(RailVisible);
  if (!visible) return <span aria-hidden="true" className={`block bg-surface-2 ${className}`} />;
  return (
    <Image
      unoptimized
      src={`https://image.tmdb.org/t/p/w780/${path.replace(/^\//, "")}`}
      alt=""
      width={780}
      height={439}
      className={`block object-cover ${className}`}
    />
  );
}
