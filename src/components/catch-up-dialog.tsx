"use client";

import { Check, CheckCheck, ListChecks } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * What to do about the episodes you skipped past.
 *
 * Marking episode nine when one to eight are blank almost never means "I have
 * seen only the ninth". It usually means you have been watching without logging
 * and have caught up here — but not always, and the app has no way to know
 * which. So it asks, at the one moment the question is obviously relevant, and
 * only then: an episode with nothing unwatched behind it goes straight on
 * without a word.
 *
 * This replaced a permanent button on every unwatched row. That button was
 * always there, said "mark this and everything before" in a tooltip nobody read,
 * and sat one thumb-width from the ordinary tick — so the difference between
 * logging one episode and rewriting a season's history was a near miss.
 */

export type CatchUpChoice = "one" | "season" | "all";

export function CatchUpDialog({
  episodeLabel,
  inSeason,
  before,
  onPick,
  onClose,
}: {
  /** How the episode reads, e.g. "S02E09". */
  episodeLabel: string;
  /** Unwatched aired episodes before this one, inside this season. */
  inSeason: number;
  /** The same, counting every earlier season too. */
  before: number;
  onPick: (choice: CatchUpChoice) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options: {
    value: CatchUpChoice;
    icon: typeof Check;
    label: string;
    note: string;
    show: boolean;
  }[] = [
    {
      value: "one",
      icon: Check,
      label: "Just this episode",
      note: "The earlier ones stay unwatched.",
      show: true,
    },
    {
      value: "season",
      icon: ListChecks,
      label: "This one and the rest of the season",
      note: `Fills in ${inSeason} earlier episode${inSeason === 1 ? "" : "s"} from this season.`,
      show: inSeason > 0,
    },
    {
      value: "all",
      icon: CheckCheck,
      label: "This one and everything before it",
      note: `Fills in ${before} earlier episode${
        before === 1 ? "" : "s"
      }, across every season up to here.`,
      // Only worth offering when it would do more than the season option.
      show: before > inSeason,
    },
  ];

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="How much to mark as watched"
      onClick={onClose}
      className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="ios-menu w-full max-w-sm overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/95 shadow-2xl shadow-black/60 backdrop-blur-2xl"
      >
        <div className="border-b border-white/10 px-4 py-3 light:border-ink-800">
          <p className="text-sm font-semibold">You skipped a few</p>
          <p className="ios-dim mt-0.5 text-xs text-ink-400">
            There are episodes before {episodeLabel} you have not logged. How much should go
            down as watched?
          </p>
        </div>

        {options
          .filter((option) => option.show)
          .map(({ value, icon: Icon, label, note }) => (
            <button
              key={value}
              type="button"
              onClick={() => onPick(value)}
              className="flex w-full items-start gap-2.5 border-b border-white/10 px-4 py-3 text-left text-sm text-ink-100 transition last:border-0 hover:bg-white/10 light:border-ink-800 light:hover:bg-black/5"
            >
              <Icon size={15} className="mt-0.5 shrink-0" />
              <span>
                {label}
                <span className="ios-dim mt-0.5 block text-xs text-ink-400">{note}</span>
              </span>
            </button>
          ))}
      </div>
    </div>,
    document.body,
  );
}
