"use client";

import { Check, ChevronDown, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

/**
 * "When did you watch it?", asked without ever making anybody answer.
 *
 * The button that opens this has already logged the thing at the current time,
 * so this is a correction rather than a required step: it opens automatically,
 * offers the three answers people actually give, and closes itself if ignored.
 * Picking one overwrites the timestamp.
 */

export type WatchedChoice = { label: string; date: Date };

/** Fixed, because the menu is positioned by hand rather than by the layout. */
const MENU_WIDTH = 224;

function atNoon(daysAgo: number) {
  // Midday, not midnight: a date-only answer should not land on a day boundary
  // where a timezone shift can push it onto the wrong day.
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, 0, 0);
  return date;
}

/**
 * Rendered only while it is open, so it starts on the shortcuts every time
 * rather than on whatever the last use left behind.
 */
export function WatchedDateMenu({
  onPick,
  onClose,
  onWatchAgain,
  onUnwatch,
  unwatchLabel = "Unwatch episode",
  onUnwatchAll,
  unwatchAllLabel,
  releaseDate,
  align = "left",
}: {
  onPick: (date: Date) => void;
  onClose: () => void;
  /**
   * Logs another viewing. Present only for something already on record — and
   * kept in here rather than given a button of its own, so the action row on a
   * title page does not grow a fourth control for something done occasionally.
   */
  onWatchAgain?: () => void;
  /** Present when the thing is already logged, which is what offers "unwatch". */
  onUnwatch?: () => void;
  unwatchLabel?: string;
  /**
   * Only for something watched more than once, where "unwatch" has two possible
   * meanings. Taking back the last viewing is the one people want after a
   * mis-tap, so it stays the plain option and this is the deliberate one.
   */
  onUnwatchAll?: () => void;
  unwatchAllLabel?: string;
  /** Air or release date, offered as an answer in its own right. */
  releaseDate?: string | null;
  align?: "left" | "right";
}) {
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Fixed at mount rather than read on every render: the menu is short-lived,
  // and a component that reads the clock while rendering is not pure.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const trigger = anchor.current;
    const menu = ref.current;
    if (!trigger) return;

    // Positioned against the viewport from the anchor's own position. Flipping
    // upward was not enough on its own: the episode list is a rounded card with
    // `overflow: hidden`, which clips the menu whichever way it opens. Only
    // leaving the card entirely fixes that, hence the portal.
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const height = menu?.offsetHeight ?? 240;
      const below = window.innerHeight - rect.bottom;

      const top =
        below < height + 16 && rect.top > height + 16
          ? rect.top - height - 8
          : rect.bottom + 8;

      const left =
        align === "right" ? Math.max(8, rect.right - MENU_WIDTH) : Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);

      setBox({ top, left });
    };

    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [picking, align, onUnwatch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    // The browser draws the date picker in its own layer, outside this tree, so
    // every click inside it looks like a click outside the menu — which was
    // closing the menu halfway through choosing a date. While the calendar is
    // up, only Escape or "Back" dismisses this.
    if (picking) return;

    function onPointerDown(e: PointerEvent) {
      // The anchor sits inside the button that opened this, so a tap on that
      // button must not count as "outside" — it would close and reopen.
      if (ref.current?.contains(e.target as Node)) return;
      if (anchor.current?.parentElement?.contains(e.target as Node)) return;
      onClose();
    }

    // pointerdown rather than mousedown: on a phone the mouse events arrive
    // late, after the tap has already been handled.
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, picking]);

  const options: WatchedChoice[] = [
    { label: "Yesterday", date: atNoon(1) },
    { label: "2 days ago", date: atNoon(2) },
  ];

  // "The day it came out" is the honest answer for anything watched on release
  // and logged later — and for a back catalogue it is nonsense, so it is only
  // offered where there is a date to offer.
  // Compared as plain dates: TMDB air dates carry no time or zone, and the
  // shortcuts above are already built from today's date.
  const released = releaseDate ? new Date(`${releaseDate}T12:00:00`) : null;
  if (released && !Number.isNaN(released.getTime()) && releaseDate! <= today) {
    options.push({ label: "At release date", date: released });
  }

  const menu = (
    <div
      ref={ref}
      style={{ top: box?.top ?? -9999, left: box?.left ?? -9999, width: MENU_WIDTH }}
      /**
       * Above every overlay in the app, not merely above the page. This is
       * portalled to the body, so it stacks against the search overlay and the
       * episode dialog — both `z-[100]` — rather than against whatever opened
       * it. At `z-50` it opened *behind* the episode dialog, which looked
       * exactly like the watch button doing nothing.
       */
      className="ios-menu fixed z-[110] overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/95 backdrop-blur-2xl"
    >
      <p className="ios-bright border-b border-white/10 light:border-ink-800 px-3 py-2 text-[11px] text-ink-400">
        {onUnwatch ? "When did you watch it?" : "Logged just now. Watched it earlier?"}
      </p>

      {picking ? (
        <div className="p-3">
          {/* Committed on Save rather than on change: a date field reports every
              half-typed value, and acting on those closed the menu on "0002". */}
          <input
            type="date"
            autoFocus
            value={draft}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3 py-2 text-base outline-none focus:border-flare-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!draft}
              onClick={() => {
                // Parsed as local midday for the same reason as the shortcuts.
                const [year, month, day] = draft.split("-").map(Number);
                if (!year || !month || !day) return;
                onPick(new Date(year, month - 1, day, 12));
              }}
              className="rounded-lg bg-flare-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-flare-500 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="text-xs text-ink-400 transition hover:text-ink-100"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="py-1">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onPick(option.date)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-100 transition hover:bg-white/10 light:hover:bg-black/5"
            >
              <Check size={14} className="shrink-0" />
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-100 transition hover:bg-white/10 light:hover:bg-black/5"
          >
            <ChevronDown size={14} className="shrink-0" />
            Earlier…
          </button>

          {/* Logging another viewing is not a date correction, so it sits below
              the dates — and below is also where it belongs for safety, since
              this menu opens by itself the moment something is first marked
              watched and the dates are what is wanted in that moment. */}
          {onWatchAgain && (
            // The same block the sign-out button uses at the foot of the avatar
            // menu — a tinted panel rather than a row — because this is not one
            // more date to pick, it is a decision of a different kind. Violet
            // rather than red: it adds something.
            <div className="border-t border-white/10 light:border-ink-800 p-2 pt-2">
              <button
                type="button"
                onClick={onWatchAgain}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-flare-500/40 bg-flare-500/15 px-3 py-2.5 text-sm font-semibold text-flare-300 transition hover:border-flare-500/70 hover:bg-flare-500/25"
              >
                <RotateCcw size={15} />
                Watch again
              </button>
            </div>
          )}

          {/* Taking it back is a different kind of action, so it sits apart
              from the dates rather than among them. */}
          {onUnwatch && (
            <div className="p-2 pt-0">
              <button
                type="button"
                onClick={onUnwatch}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-500/20"
              >
                <Undo2 size={15} />
                {unwatchLabel}
              </button>
            </div>
          )}

          {onUnwatchAll && (
            <div className="p-2 pt-0">
              <button
                type="button"
                onClick={onUnwatchAll}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-500/20"
              >
                <Trash2 size={15} />
                {unwatchAllLabel ?? "Remove every watch"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Stays where the menu logically belongs, purely to be measured. */}
      <span ref={anchor} aria-hidden className="pointer-events-none absolute inset-0" />
      {createPortal(menu, document.body)}
    </>
  );
}
