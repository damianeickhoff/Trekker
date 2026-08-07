"use client";

import { CalendarDays, Clock } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

/** When to say a run of caught-up episodes was watched. */
export type CatchUpWhen = "now" | "aired";

/** Fixed, because the menu is positioned by hand rather than by the layout. */
const MENU_WIDTH = 244;

/**
 * "Mark this and everything before it as watched" — but *when*?
 *
 * Catching up is nearly always one of two stories, and they want opposite
 * answers. Either you have just binged the lot, in which case today is right
 * and the whole run belongs in this week's history; or you watched the show as
 * it went out years ago and are only now telling Trekker, in which case today
 * is a lie that puts a decade of television into one afternoon.
 *
 * Portalled and positioned against the viewport for the same reason as the
 * watched-date menu next to it: the episode list is a rounded card, and a menu
 * that opens inside it is clipped by it whichever way it goes.
 */
export function CatchUpMenu({
  upTo,
  count,
  onPick,
  onClose,
  align = "left",
}: {
  /** The episode being caught up to, e.g. `02×07`, for the heading. */
  upTo: string;
  /** How many episodes of *this* season it covers. Earlier ones are extra. */
  count: number;
  onPick: (when: CatchUpWhen) => void;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = anchor.current;
    const menu = ref.current;
    if (!trigger) return;

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const height = menu?.offsetHeight ?? 200;
      const below = window.innerHeight - rect.bottom;

      // Flips above the button when there is no room under it, which on the
      // last row of a long season is most of the time.
      const top =
        below < height + 16 && rect.top > height + 16 ? rect.top - height - 8 : rect.bottom + 8;

      const left =
        align === "right"
          ? Math.max(8, rect.right - MENU_WIDTH)
          : Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);

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
  }, [align]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    function onPointerDown(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      // The anchor sits inside the button that opened this, so a tap on that
      // button must not count as "outside" — it would close and reopen.
      if (anchor.current?.parentElement?.contains(e.target as Node)) return;
      onClose();
    }

    document.addEventListener("keydown", onKey);
    // pointerdown rather than mousedown: on a phone the mouse events arrive
    // late, after the tap has already been handled.
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  const menu = (
    <div
      ref={ref}
      role="menu"
      style={{ top: box?.top ?? -9999, left: box?.left ?? -9999, width: MENU_WIDTH }}
      // Above the episode dialog, which is `z-[100]` and can be open behind it.
      className="fixed z-[110] overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/95 backdrop-blur-2xl"
    >
      <p className="border-b border-ink-800 px-3 py-2 text-[11px] text-ink-400">
        Catch up to <span className="font-mono text-ink-300">{upTo}</span> — {count} episode
        {count === 1 ? "" : "s"} this season, plus any earlier ones.
      </p>

      <div className="py-1">
        <Choice
          icon={Clock}
          label="Watched just now"
          note="They all get today's date."
          onClick={() => onPick("now")}
        />
        <Choice
          icon={CalendarDays}
          label="Watched as they aired"
          note="Each episode takes its own air date."
          onClick={() => onPick("aired")}
        />
      </div>
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

function Choice({
  icon: Icon,
  label,
  note,
  onClick,
}: {
  icon: typeof Clock;
  label: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
    >
      <Icon size={14} className="mt-0.5 shrink-0 text-ink-600" />
      <span>
        {label}
        <span className="mt-0.5 block text-xs text-ink-500">{note}</span>
      </span>
    </button>
  );
}
