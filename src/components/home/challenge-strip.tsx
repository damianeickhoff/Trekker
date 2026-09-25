"use client";

import { useState, useTransition } from "react";
import type { MonthlyChallenges } from "@/lib/challenges";
import { setChallengesCollapsed } from "@/lib/home-actions";
import { Count } from "../count";
import { Icon } from "../icon";
import { FILL, fillTo, foldChevron, PRESS } from "../motion";
import { Unfold } from "../unfold";

type Card = MonthlyChallenges["cards"][number];

/**
 * This month's three challenges, placed as the old app placed them: a
 * full-width strip above the Up next card at every width, folding to one
 * summary line (its head, a surface bar) and opening to the three tiles under
 * it (stacked on phones, side by side from `sm`). A standing invitation
 * rather than the reason anyone opened the page, so it can be put away at
 * either width; the choice is saved on the account
 * (`User.challengesCollapsed`) so it follows the person to their other
 * devices, and the strip changes at once without waiting for the save.
 */
export function ChallengeStrip({ data, collapsed: initial }: { data: MonthlyChallenges; collapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initial);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    startTransition(() => setChallengesCollapsed(next));
  }

  const title = `${data.month} challenges`;
  const daysLeft = `${data.daysLeft} ${data.daysLeft === 1 ? "day" : "days"} left`;
  const xpLeft = data.cards.filter((c) => !c.done).reduce((sum, c) => sum + c.xp, 0);
  // The figures count to a new value when a challenge is won while the page is open, never on load.
  const open = (
    <>
      <Count to={data.open} on="change" /> of {data.cards.length} open
    </>
  );
  // On a phone the line holds the count alone; the rest would only be cut off.
  const more =
    data.open === 0 ? null : (
      <>
        {" · "}
        <Count to={xpLeft} on="change" /> XP to win · {daysLeft}
      </>
    );

  return (
    <section aria-label={title} className="flex flex-col">
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="challenge-tiles"
          className={`${PRESS} flex h-11 w-full items-center gap-2.5 rounded-2xl border-0 bg-surface px-3.5 text-left text-ink shadow-elevation hover:bg-surface-2 lg:h-12 lg:px-4`}
        >
          <Icon name="trophy" size={16} className="text-accent-text" />
          <span className="min-w-0 truncate text-[13px] font-semibold">
            {title}
            <span className="font-normal text-ink-3"> · </span>
            <span className="mono-label">
              {open}
              {more && <span className="hidden sm:inline">{more}</span>}
            </span>
          </span>
          <span className="grow" />
          <Icon name="chevR" size={16} className={`text-ink-3 ${foldChevron(!collapsed)}`} />
        </button>
      </h2>
      {/* Kept mounted, so opening and closing slide (`Unfold`). */}
      <Unfold open={!collapsed} id="challenge-tiles" className="pt-2.5 lg:pt-3.5">
        <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-3 lg:gap-3.5">
          {data.cards.map((c) => (
            <Tile key={c.id} card={c} daysLeft={daysLeft} />
          ))}
        </ul>
      </Unfold>
    </section>
  );
}

/** The challenge's icon on a small plate; a won one swaps it for the tick on the accent. */
function Glyph({ card, className }: { card: Card; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${
        card.done ? "bg-accent text-black" : "bg-surface-2 text-ink-2"
      } ${className}`}
    >
      <Icon name={card.done ? "check" : card.icon} size={14} />
    </span>
  );
}

const MONO = "shrink-0 font-mono text-[11px] font-medium tracking-[0.05em]";

/** Progress in the challenge's own terms: "3/8", "12h/25h". */
function Score({ card }: { card: Card }) {
  return <span className={`${MONO} ${card.done ? "text-accent-text" : "text-ink-3"}`}>{card.label}</span>;
}

/** What it pays. Amber once won, since amber is state; the glyph carries the tick. */
function Xp({ card }: { card: Card }) {
  return (
    <span className={`${MONO} whitespace-nowrap ${card.done ? "text-accent-text" : "text-ink-2"}`}>
      +{card.xp} XP
    </span>
  );
}

function Progress({ card }: { card: Card }) {
  return (
    <div
      className="h-1 min-w-0 grow overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label={card.name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={card.percent}
    >
      <div className={FILL} style={fillTo(card.percent)} />
    </div>
  );
}

/** One challenge, the rebuild's tile: its glyph, name and pay, what it asks, the bar and the days left. */
function Tile({ card, daysLeft }: { card: Card; daysLeft: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-[14px] bg-surface px-3.5 py-3 shadow-elevation">
      <div className="flex items-center gap-2">
        <Glyph card={card} className="size-6 rounded-md" />
        <span className="min-w-0 grow truncate text-[13px] font-semibold">{card.name}</span>
        <Xp card={card} />
      </div>
      <span className="line-clamp-2 text-xs leading-snug text-ink-2">{card.description}</span>
      <div className="mt-auto flex items-center gap-2.5">
        <Progress card={card} />
        <Score card={card} />
      </div>
      <span className="text-[11px] text-ink-3">{card.done ? "Won" : daysLeft}</span>
    </li>
  );
}
