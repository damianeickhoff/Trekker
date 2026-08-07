"use client";

import {
  Award,
  Boxes,
  CheckCheck,
  ChevronDown,
  Film,
  Gauge,
  PenLine,
  Target,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { LevelState } from "@/lib/achievements";
import { barWidth } from "@/lib/format";
import { MAX_LEVEL, formatXp } from "@/lib/levels";
import { setXpPanelCollapsed } from "@/lib/panel-actions";

const ICONS: Record<string, LucideIcon> = {
  award: Award,
  boxes: Boxes,
  "check-check": CheckCheck,
  film: Film,
  gauge: Gauge,
  "pen-line": PenLine,
  target: Target,
  tv: Tv,
};

/**
 * Where the XP came from, on the achievements page.
 *
 * Every row is what was earned **here**, not over a lifetime: episodes and films
 * logged on Trekker rather than imported, badges earned rather than carried in,
 * shows finished since the starting line. That is what the bar above is made of,
 * and a breakdown that did not add up to it would be worse than none.
 *
 * The whole point is that it adds up in public: every row says how many of a
 * thing and what each was worth, so a level is never a number the app just
 * decided on. Rows worth nothing yet stay in the list — they are the answer to
 * "what else counts?".
 *
 * Folded away, what is left is the one line that answers "how am I doing" — how
 * much is left to the next level, and the bar. The breakdown is the reasoning
 * behind that line, and reasoning is worth being able to put away. Which state
 * it is in lives on the account, so it follows you between devices.
 */
export function LevelPanel({
  level,
  collapsed: initiallyCollapsed = false,
}: {
  level: LevelState;
  collapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  // Share of the total, not share of the biggest row. Measured against the
  // biggest, whichever source happens to lead is drawn full — which reads as
  // "finished" on a page where every other bar means exactly that. Against the
  // total the bars add up to one whole, and a full one honestly means "all of
  // your XP came from this".
  const earned = Math.max(1, level.sources.reduce((sum, source) => sum + source.xp, 0));

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    void setXpPanelCollapsed(next);
  }

  return (
    <section className="mt-8">
      <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
        Experience
      </p>
      <h2 className="mt-0.5 mb-3 text-lg font-semibold tracking-tight">
        Level {level.level} · {level.rank}
      </h2>

      <div className="card p-5">
        {/* The control belongs to the card it opens, not to the heading above
            it — out there it read as though it might fold the whole section
            away, heading and all. */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-ink-300">
                {level.maxed ? (
                  <>Level {MAX_LEVEL} is the top of the ladder.</>
                ) : (
                  <>
                    <span className="font-semibold text-ink-100">
                      {formatXp(level.toNextLevel)}
                    </span>{" "}
                    to level {level.level + 1}
                    {/* Kept when folded: it is the answer to "and then what",
                        which is half the reason to look at this at all. */}
                    {level.next && (
                      <>
                        , and {level.next.title} at level {level.next.level}
                      </>
                    )}
                    .
                  </>
                )}
              </p>
              <p className="font-mono text-xs text-ink-400 tabular-nums">
                {level.intoLevel.toLocaleString("en-GB")} /{" "}
                {level.levelSpan.toLocaleString("en-GB")} this level
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? "Show where the XP came from" : "Hide where the XP came from"
            }
            className="-mt-1 -mr-1 grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-lg text-ink-400 transition hover:bg-ink-800/70 hover:text-ink-100"
          >
            <ChevronDown
              size={17}
              className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            />
          </button>
        </div>

        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
            style={{ width: `${barWidth(level.percent)}%` }}
          />
        </div>

        {/*
          The open and close is a grid row going from `0fr` to `1fr` rather than
          a height being animated, because nothing here knows how tall the
          breakdown is — it depends on how many sources have anything in them —
          and `height: auto` cannot be transitioned. The row fraction can, and
          the child clipping its own overflow is what turns that into a wipe.

          The content stays mounted throughout: rendering it only when open
          would mean there was nothing to slide on the way in and nothing left
          to slide on the way out.
        */}
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
            collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
          aria-hidden={collapsed}
        >
        <div className="min-h-0 overflow-hidden">
        <ul className="mt-5 divide-y divide-ink-800">
          {level.sources.map((source) => {
            const Icon = ICONS[source.icon] ?? Zap;
            const share = (source.xp / earned) * 100;

            return (
              <li key={source.key} className="flex items-center gap-3 py-2.5">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    source.xp > 0
                      ? "bg-flare-600/15 text-flare-400"
                      : "bg-ink-800/60 text-ink-600"
                  }`}
                >
                  <Icon size={15} />
                </span>

                {/*
                  No bar on these rows. A bar promises a target, and none of
                  these have one — there is no number of films you are working
                  towards, so a half-full track under "Films watched" invented a
                  goal that does not exist. Drawn as a share of the whole it was
                  worse again: earning anything anywhere made every other row
                  shrink, so a row went *backwards* on a page about going
                  forwards. The share is a fact worth stating, so it is stated.
                */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      source.xp > 0 ? "text-ink-100" : "text-ink-400"
                    }`}
                  >
                    {source.label}
                  </p>
                  <p className="truncate font-mono text-[10px] text-ink-500 tabular-nums">
                    {source.detail}
                    {source.xp > 0 && ` · ${Math.round(share)}% of your XP`}
                  </p>
                </div>

                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {source.xp.toLocaleString("en-GB")}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 space-y-1.5 border-t border-ink-800 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Earned on Trekker</span>
            <span className="font-mono text-lg font-bold text-flare-400 tabular-nums">
              {formatXp(level.xp)}
            </span>
          </div>

          {level.carriedXp > 0 && (
            <p className="pt-1 text-xs text-ink-500">
              A further {formatXp(level.carriedXp)} came in with your imported history —
              counted towards your lifetime level of {level.lifetime.level} (
              {level.lifetime.rank}), but not towards this one. Everything above is what you
              have watched, rated and won here.
            </p>
          )}
        </div>

        {level.syncedAt === null && (
          <p className="mt-3 text-[11px] text-ink-500">
            Shows finished and franchises completed are worked out on this page — they will
            count from your next visit.
          </p>
        )}
        </div>
        </div>
      </div>
    </section>
  );
}
