"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { stopWatching } from "@/lib/play-actions";
import { Icon } from "../icon";
import { Link } from "../link";
import { EXIT, usePresence } from "../presence";
import { MENU, MENU_ITEM } from "../title/popover";

/**
 * The card's "more": go to the show, or stop being asked about it. Stopping
 * keeps every viewing; it only takes the show out of Up next and the calendar.
 */
export function CardMoreMenu({ showId, showName, className }: { showId: number; showName: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { mounted, state } = usePresence(open, EXIT.fast);
  const item = MENU_ITEM;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        <Icon name="dots" size={20} />
      </button>
      {mounted && (
        <div role="menu" data-state={state} className={`${MENU} left-0 top-[calc(100%+8px)] w-56 origin-top-left`}>
          <Link role="menuitem" href={`/title/tv/${showId}`} className={item}>
            <Icon name="chevR" size={18} />
            Go to show
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await stopWatching(showId);
                setOpen(false);
              })
            }
            className={item}
          >
            <Icon name="x" size={18} />
            Stop suggesting {showName.length > 18 ? "this show" : showName}
          </button>
        </div>
      )}
    </div>
  );
}
