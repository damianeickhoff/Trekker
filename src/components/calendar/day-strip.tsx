"use client";

import { useState, type CSSProperties } from "react";
import { HANDED_OVER, PRESS } from "../motion";
import { SegmentPill } from "../segment-pill";

/** Dots beyond five stop being countable at a glance. */
const MAX_DOTS = 5;

export type StripDay = {
  day: string;
  weekday: string;
  date: number;
  count: number;
  /** "Tuesday 14, 2 landing", its accessible name. */
  name: string;
};

/**
 * The phone's strip of seven days. A day with something landing is a link to
 * its place in the agenda below; the day you are at wears the amber pill,
 * today when the week holds it, and a tapped day after that. The pill is one
 * shape that slides between days over `--base` (`SegmentPill`, as the
 * segmented controls and the tab bar move theirs) rather than jumping, and it
 * passes over the other days' tiles but under their words. Today keeps its
 * date in amber when the pill has moved away from it. The dots fade in as the
 * week arrives (`motion-dots`), a day at a time.
 */
export function DayStrip({ days, today }: { days: StripDay[]; today: string }) {
  const [at, setAt] = useState(days.some((d) => d.day === today) ? today : null);
  return (
    <div role="list" aria-label="Days" className="relative grid grid-cols-7 gap-1.5">
      <SegmentPill className="z-(--z-lift) rounded-[14px] bg-accent" />
      {days.map((d, i) => {
        const on = d.day === at;
        const isToday = d.day === today;
        const tile = (
          // Over the pill, which is over the tiles' own fill.
          <span className="relative z-2 flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3 in-data-on:text-black">{d.weekday.slice(0, 3)}</span>
            <span className={`font-display text-[22px] font-bold leading-none ${isToday ? "text-accent-text" : ""} in-data-on:text-black`}>{d.date}</span>
            <span className="flex h-[5px] gap-[3px]" aria-hidden="true">
              {Array.from({ length: Math.min(d.count, MAX_DOTS) }, (_, n) => (
                <span
                  key={n}
                  className="motion-dots size-[5px] rounded-full bg-accent-text in-data-on:bg-black"
                  style={{ "--i": i } as CSSProperties}
                />
              ))}
            </span>
          </span>
        );
        const cls = `flex h-[70px] flex-col items-center justify-center rounded-[14px] bg-surface text-ink shadow-elevation transition-colors duration-(--fast) ease-out data-on:bg-accent data-on:text-black data-on:shadow-none ${HANDED_OVER}`;
        return (
          <div key={d.day} role="listitem" className="min-w-0">
            {d.count ? (
              <a
                href={`#day-${d.day}`}
                aria-label={d.name}
                aria-current={isToday ? "date" : undefined}
                data-segment=""
                data-on={on ? "" : undefined}
                onClick={() => setAt(d.day)}
                className={`${cls} ${PRESS}`}
              >
                {tile}
              </a>
            ) : (
              <div aria-label={d.name} data-on={on ? "" : undefined} data-segment={on ? "" : undefined} className={cls}>
                {tile}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
