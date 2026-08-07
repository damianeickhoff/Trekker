"use client";

import { CheckCheck, Eraser, RotateCcw } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { logShowRewatch, setShowWatched } from "@/lib/actions";
import { Popover } from "./popover";
import { WatchDial } from "./watch-dial";
import { BusyBar } from "./ui";

export function MarkShowButton({
  showId,
  showName,
  showPoster,
  hasProgress,
  fullyWatched,
  watched,
  total,
}: {
  showId: number;
  showName: string;
  showPoster: string | null;
  hasProgress: boolean;
  /** Every released episode already logged — nothing left for the button to do. */
  fullyWatched: boolean;
  /** What the dial fills from: episodes logged, out of every episode there is. */
  watched: number;
  total: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** Which job the progress bar is describing. */
  const [busy, setBusy] = useState<"marking" | "rewatching">("marking");
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  function runRewatch() {
    setBusy("rewatching");
    startTransition(async () => {
      const res = await logShowRewatch({ showId, showName, showPoster });
      setNote(
        "error" in res && res.error
          ? res.error
          : // Zero means everything was logged within the last half hour, which
            // is the duplicate guard doing its job rather than a failure.
            res.episodes === 0
            ? "Already logged just now"
            : `Logged another ${res.episodes} episode${res.episodes === 1 ? "" : "s"}`,
      );
    });
  }

  function run(watched: boolean) {
    setBusy("marking");
    setConfirming(false);
    startTransition(async () => {
      const res = await setShowWatched({ showId, showName, showPoster, watched });
      setNote(
        "error" in res && res.error
          ? res.error
          : !watched
            ? "Cleared this show"
            : // Only the gaps are filled now, so this counts what was actually
              // added rather than the whole run — which can be nothing at all.
              res.episodes === 0
              ? "Already up to date"
              : `Logged ${res.episodes} released episode${res.episodes === 1 ? "" : "s"}`,
      );
    });
  }

  // Clearing a whole show throws away real history, so make that a two-step.
  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-300">Clear every logged episode?</span>
        <button
          onClick={() => run(false)}
          className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
        >
          Yes, clear
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Marking a whole show pulls every season from TMDB, which on a long-running
  // series is several seconds of nothing happening on screen.
  if (pending) {
    return (
      <div className="w-full max-w-xs">
        <BusyBar
          label={
            busy === "rewatching"
              ? "Logging another viewing of every episode…"
              : "Logging every released episode…"
          }
        />
      </div>
    );
  }

  /**
   * One control, in the shape the episodes below it use: an empty ring while
   * there is something left to log, a filled tick once there is not.
   *
   * It used to be up to three labelled buttons — "Mark entire show as watched",
   * "Watched the whole show again", "Unmark all" — which said the same sentence
   * on every show and took a line of their own to do it. What they were really
   * offering is one question with two or three answers, and a menu is what that
   * shape is called.
   */
  return (
    <div className="relative">
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={fullyWatched ? "This show is fully watched" : "Mark the whole show watched"}
        title={fullyWatched ? "Every released episode is logged" : "Mark the whole show watched"}
        className="rounded-full transition disabled:opacity-60"
      >
        <WatchDial watched={watched} total={total} busy={pending} />
      </button>

      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} align="end" width={268}>
          <div role="menu">
            {!fullyWatched && (
              <MenuRow
                icon={CheckCheck}
                label="Mark the whole show watched"
                note="Every released episode, logged as of today. Anything already on record keeps its own date."
                onClick={() => {
                  setOpen(false);
                  run(true);
                }}
              />
            )}

            {fullyWatched && (
              <MenuRow
                icon={RotateCcw}
                label="Watched it all again"
                note="Logs a second viewing of every released episode. Anything watched in the last half hour is left alone."
                onClick={() => {
                  setOpen(false);
                  runRewatch();
                }}
              />
            )}

            {hasProgress && (
              <MenuRow
                icon={Eraser}
                tone="danger"
                label="Clear every logged episode"
                note="Removes every watch of this show, rewatch counts included. There is no undo."
                onClick={() => {
                  setOpen(false);
                  setConfirming(true);
                }}
              />
            )}
          </div>
        </Popover>
      )}

      {note && <span className="ios-dim ml-2 text-xs text-ink-400">{note}</span>}
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  note,
  tone,
  onClick,
}: {
  icon: typeof CheckCheck;
  label: string;
  note: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 border-b border-white/10 px-3 py-3 text-left text-sm transition last:border-0 hover:bg-white/10 light:border-ink-800 light:hover:bg-black/5 ${
        tone === "danger" ? "text-red-400" : "text-ink-100"
      }`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>
        {label}
        <span className="ios-dim mt-0.5 block text-xs text-ink-400">{note}</span>
      </span>
    </button>
  );
}
