"use client";

import { useState, type CSSProperties } from "react";
import type { BadgeState } from "@/lib/achievements";
import { DrawOnView } from "../draw";
import { PRESS } from "../motion";
import { Medal } from "./medal";
import { legendEdge } from "./parts";

/**
 * The ring round a medal: how far through, amber on the surface's track, the
 * old app's way of saying progress, with the badge's own medal in the middle.
 * Once earned the ring goes (the medal's metal says it) and only the medal
 * stands, in the same box, so a row of them lines up. Inside a `DrawOnView`
 * the arc draws to its value the first time it is seen (`draw-arc`).
 * `pop` restarts the medal's pop (`motion-bump`): a new key each press.
 */
export function MedalRing({
  badge,
  size = 58,
  medal = 46,
  pop = 0,
}: {
  badge: Pick<BadgeState, "tier" | "icon" | "earned" | "percent">;
  size?: number;
  medal?: number;
  pop?: number;
}) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {!badge.earned && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0 -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
          {badge.percent > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - badge.percent / 100)}
              style={{ "--arc": `${c}px` } as CSSProperties}
              className="draw-arc stroke-accent"
            />
          )}
        </svg>
      )}
      <span key={pop} className={`inline-flex ${pop ? "motion-bump" : ""}`}>
        <Medal tier={badge.tier} icon={badge.icon} earned={badge.earned} size={medal} flourish />
      </span>
    </span>
  );
}

/**
 * "Earned 5 Aug", or how far in the badge's own terms and the percentage:
 * "3 of 10 · 30%". A measured detail may name its subject first ("The Fast
 * and the Furious · 9 of 10"); the description above the line already says
 * that, so only what follows the last separator is kept.
 */
export function badgeLine(badge: Pick<BadgeState, "earned" | "sub" | "percent" | "toGo">) {
  if (badge.earned || badge.toGo === null) return badge.sub;
  const at = badge.sub.lastIndexOf(" · ");
  const far = at >= 0 ? badge.sub.slice(at + 3) : badge.sub;
  return `${far} · ${badge.percent}%`;
}

/**
 * One badge, as the old app laid it out: a row, not a tile. Left, the medal
 * in its ring; right, the name, the description in full (a phone cannot
 * hover for a tooltip), and a mono line saying when it was earned or how far
 * it has come. The ring is the progress, so there is no bar. Legendary keeps
 * its gold edge. The whole row is a button that opens the badge
 * (`BadgeDetail` in `board.tsx`), and the medal pops as it does. The board
 * and Closest to earning draw this one row.
 */
export function BadgeRow({ badge, onOpen }: { badge: BadgeState; onOpen: () => void }) {
  const [pop, setPop] = useState(0);
  return (
    <DrawOnView as="div" role="listitem" className="flex min-w-0">
      <button
        type="button"
        onClick={() => {
          setPop((n) => n + 1);
          onOpen();
        }}
        aria-label={`${badge.name}: ${badgeLine(badge)}`}
        className={`${PRESS} flex w-full min-w-0 items-center gap-3.5 rounded-2xl border-0 bg-surface p-3.5 text-left text-ink shadow-elevation hover:bg-surface-2 ${legendEdge(badge)}`}
      >
        <MedalRing badge={badge} pop={pop} />
        <span className="flex min-w-0 grow flex-col gap-[3px]">
          <span className="text-sm font-semibold leading-[1.2]">{badge.name}</span>
          <span className="text-xs leading-snug text-ink-2">{badge.description}</span>
          <span className={`pt-0.5 font-mono text-[11px] font-medium tracking-[0.03em] ${badge.earned ? "text-accent-text" : "text-ink-3"}`}>
            {badgeLine(badge)}
          </span>
        </span>
      </button>
    </DrawOnView>
  );
}

