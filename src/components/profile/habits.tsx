"use client";

import { useState, type CSSProperties } from "react";
import type { Habit } from "@/lib/profile";
import { Icon } from "../icon";
import { PRESS } from "../motion";

/**
 * The eight habit tiles: four across from `lg`, two across on phones, where
 * six show and "All habits" opens the last two, as the mockup has it. The two
 * are in the page either way and only hidden, so opening them asks nothing
 * of the server.
 */
export function HabitsGrid({ habits }: { habits: Habit[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {habits.map((h, i) => (
          // The two "All habits" opens fade and rise in (motion-rise-in); the button is a phone's alone, and from lg they were there all along.
          <div
            key={h.key}
            className={`min-w-0 ${i >= 6 ? (open ? "motion-rise-in" : "hidden lg:block") : ""}`}
            style={i >= 6 ? ({ "--i": i - 6 } as CSSProperties) : undefined}
          >
            <HabitTile habit={h} />
          </div>
        ))}
      </div>
      {habits.length > 6 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${PRESS} self-center rounded-full border-0 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface hover:text-ink lg:hidden`}
        >
          All habits ›
        </button>
      )}
    </>
  );
}

/** One habit: its icon and name, the answer, and the line under it. Its fill lifts under a pointer, a wash like a row's. */
export function HabitTile({ habit }: { habit: Habit }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-surface px-4 py-3.5 shadow-elevation transition-colors duration-(--fast) ease-out hover:bg-surface-2">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-3">
        <Icon name={habit.icon} size={14} />
        <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.05em]">{habit.label}</span>
      </span>
      <span className="truncate font-display text-lg font-bold leading-[1.1] tracking-[-0.02em]">{habit.value}</span>
      <span className="truncate text-[11px] text-ink-3">{habit.sub}</span>
    </div>
  );
}
