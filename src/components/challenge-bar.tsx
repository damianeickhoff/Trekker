"use client";

import Link from "next/link";
import {
  CalendarCheck,
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  Film,
  Flame,
  Gauge,
  Ghost,
  History,
  Hourglass,
  Languages,
  Layers,
  MonitorPlay,
  Moon,
  PenLine,
  Ruler,
  Shapes,
  Sparkles,
  Sun,
  Target,
  Timer,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { setChallengesCollapsed } from "@/lib/panel-actions";
import { barWidth } from "@/lib/format";
import type { MonthlyChallenges } from "@/lib/challenges";

const ICONS: Record<string, LucideIcon> = {
  "calendar-check": CalendarCheck,
  camera: Camera,
  clapperboard: Clapperboard,
  film: Film,
  flame: Flame,
  gauge: Gauge,
  ghost: Ghost,
  history: History,
  hourglass: Hourglass,
  languages: Languages,
  layers: Layers,
  "monitor-play": MonitorPlay,
  moon: Moon,
  "pen-line": PenLine,
  ruler: Ruler,
  shapes: Shapes,
  sparkles: Sparkles,
  sun: Sun,
  timer: Timer,
  tv: Tv,
};

/**
 * This month's challenges, at the top of the dashboard.
 *
 * A strip rather than a card: it is a standing invitation, not the reason
 * anyone opened the page, and the Up next hero underneath it is. Three columns
 * on a desktop, one per row on a phone.
 *
 * Folding it away is remembered on the account rather than in this browser, so
 * someone who does not want it does not have to dismiss it again on their
 * phone. The state flips locally the moment it is pressed and the write follows
 * behind — waiting on a round trip to collapse a panel would feel broken.
 */
export function ChallengeBar({
  month,
  collapsed: initiallyCollapsed = false,
}: {
  month: MonthlyChallenges;
  collapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const allDone = month.doneCount === month.challenges.length;

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    void setChallengesCollapsed(next);
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-ink-800/80 bg-gradient-to-br from-flare-600/12 via-ink-900/40 to-transparent px-4 py-3.5 backdrop-blur-sm sm:px-5">
      {/*
        One row, everything on the same centre line. The heading used to be a
        flex box of its own inside a `items-baseline` row, which gave the browser
        two different baselines to reconcile and left the status text sitting a
        pixel or two off the title. Centring both sides against the row is what
        actually lines them up, since one side carries an icon and the other does
        not.
      */}
      <div className="flex items-center gap-3">
        <Target size={15} className="shrink-0 text-flare-400" />

        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="truncate">{month.monthLabel} challenges</span>
          <span className="shrink-0 font-mono text-xs font-normal text-ink-400 tabular-nums">
            {month.doneCount}/{month.challenges.length}
          </span>
        </h2>

        <p className="ml-auto hidden text-right text-[11px] text-ink-400 sm:block">
          {allDone ? (
            <span className="font-medium text-flare-400">
              All three done — {month.earnedXp.toLocaleString("en-GB")} bonus XP
            </span>
          ) : (
            <>
              {month.remainingXp.toLocaleString("en-GB")} XP still on the table ·{" "}
              {month.daysLeft} day{month.daysLeft === 1 ? "" : "s"} left
            </>
          )}
        </p>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show this month's challenges" : "Hide this month's challenges"}
          className="ml-auto grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-lg text-ink-400 transition hover:bg-ink-800/70 hover:text-ink-100 sm:ml-0"
        >
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
      </div>

      {!collapsed && (
        <>
          {/* On a phone the status line has no room on the header row, so it
              moves under it rather than being dropped. */}
          <p className="mt-1 text-[11px] text-ink-400 sm:hidden">
            {allDone
              ? `All three done — ${month.earnedXp.toLocaleString("en-GB")} bonus XP`
              : `${month.remainingXp.toLocaleString("en-GB")} XP still on the table · ${
                  month.daysLeft
                } day${month.daysLeft === 1 ? "" : "s"} left`}
          </p>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {month.challenges.map((challenge) => {
              const Icon = ICONS[challenge.icon] ?? Target;

              return (
                <div
                  key={challenge.id}
                  className={`rounded-xl border px-3 py-2.5 transition ${
                    challenge.done
                      ? "border-flare-500/40 bg-flare-600/10"
                      : "border-ink-800/70 bg-ink-900/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                        challenge.done
                          ? "bg-flare-600/25 text-flare-300 light:text-flare-600"
                          : "bg-ink-800/70 text-ink-400"
                      }`}
                    >
                      {challenge.done ? <Check size={13} /> : <Icon size={13} />}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-xs font-medium">
                      {challenge.name}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] text-ink-500 tabular-nums">
                      {challenge.done ? `+${challenge.xp}` : challenge.label}
                    </span>
                  </div>

                  {/* What you actually have to do. It was only ever a tooltip,
                      which is no use at all on a phone and easy to miss
                      everywhere else — the name alone does not say what counts. */}
                  <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
                    {challenge.description}
                  </p>

                  {!challenge.done && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
                        style={{ width: `${barWidth(challenge.percent)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="mt-2.5 text-[11px] text-ink-500">
            New every month, the same three for everyone.{" "}
            <Link href="/achievements" className="text-flare-400 hover:text-flare-500">
              Your level and badges
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
