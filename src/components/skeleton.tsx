import type { ReactNode } from "react";

/*
 * Skeleton pieces. Each route's loading.tsx composes these into the shape of
 * that screen, so the real page lands in the same places rather than
 * rearranging. They do not pulse or fade: a skeleton is a frame, not a show.
 */

/** One grey block. Size and radius come from the caller's classes. */
export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`shrink-0 bg-surface-2 ${className}`} />;
}

/** On a hero, which is dark in both themes, bones are translucent white. */
export function HeroBone({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`shrink-0 bg-white/10 ${className}`} />;
}

export function BoneHead() {
  return (
    <div className="flex items-baseline gap-3">
      <Bone className="h-5 w-40 rounded-md" />
      <Bone className="h-3 w-[70px] rounded" />
    </div>
  );
}

/** A rail of identical tiles, clipped at the edge like the real one. */
export function BoneRail({ count, tile }: { count: number; tile: string }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className={tile} />
      ))}
    </div>
  );
}

/** Wraps a skeleton so assistive tech hears one "loading" rather than silence. */
export function SkeletonScreen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={`Loading ${label}`} aria-busy="true">
      {children}
    </div>
  );
}

/**
 * A rail of the poster system's cards (`poster-card.tsx`), 9px apart: the
 * standard poster with its two caption lines, or the wide card. `hero` is for
 * a band, dark in both themes.
 */
export function CardRailBones({ count = 8, wide = false, hero = false }: { count?: number; wide?: boolean; hero?: boolean }) {
  const B = hero ? HeroBone : Bone;
  return (
    <div className="flex gap-(--card-gap) overflow-hidden">
      {Array.from({ length: count }, (_, i) =>
        wide ? (
          <B key={i} className="h-(--wide-card-h) w-(--wide-card) rounded-xl" />
        ) : (
          <div key={i} className="flex w-(--poster-card) shrink-0 flex-col gap-1.5">
            <B className="h-(--poster-card-h) w-full rounded-[10px]" />
            <B className="mt-0.5 h-3.5 w-4/5 rounded" />
            <B className="h-3 w-1/2 rounded" />
          </div>
        ),
      )}
    </div>
  );
}
