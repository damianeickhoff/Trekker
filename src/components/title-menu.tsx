"use client";

import { Check, CircleSlash, ImageIcon, Loader2, MoreHorizontal, Play } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { setProfileCover } from "@/lib/cover-actions";
import { setShowDropped } from "@/lib/dropped-actions";
import { FLOATING_ICON } from "./back-button";
import { Popover } from "./popover";

/**
 * The overflow menu on a title page — the home for actions that are worth
 * having but not worth a button in the hero row.
 */
export function TitleMenu({
  backdrop,
  title,
  isCover,
  show,
  request,
  variant = "icon",
}: {
  /** `button` squares up with the watch row on desktop; `icon` floats on a phone. */
  variant?: "icon" | "button";
  backdrop: string | null;
  title: string;
  /** Already the profile cover, so the action becomes "remove". */
  isCover: boolean;
  /**
   * The Overseerr request row, server-rendered and handed in. It leads the menu
   * because it is the only item here that is about the title rather than about
   * your own record of it — and because on most titles it is the reason you
   * opened the menu at all.
   */
  request?: React.ReactNode;
  /** Only shows can be given up on. */
  show?: {
    showId: number;
    dropped: boolean;
    /**
     * False when there is nothing left to be reminded about — a finished show
     * you have watched to the end. Giving up on it would mean nothing.
     */
    canDrop: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [dropped, setDropped] = useState(show?.dropped ?? false);
  const [pending, startTransition] = useTransition();
  const anchor = useRef<HTMLButtonElement>(null);

  /**
   * The tick is a receipt, not a state. It says the cover was set; a minute
   * later that is old news and the control should be a way into the menu again
   * rather than a permanent claim about something you did once.
   */
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 5000);
    return () => clearTimeout(timer);
  }, [done]);

  // Nothing to offer at all: no artwork to use, nothing to request, and not a
  // show to drop.
  if (!backdrop && !show && !request) return null;

  function apply(remove: boolean) {
    startTransition(async () => {
      await setProfileCover(remove ? null : { backdrop: backdrop!, title });
      setDone(true);
      setOpen(false);
    });
  }

  function toggleDropped() {
    if (!show) return;
    const next = !dropped;
    setDropped(next);
    setOpen(false);

    startTransition(async () => {
      await setShowDropped({ showId: show.showId, showName: title, dropped: next });
    });
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className={
          variant === "button"
            ? "ios-surface grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl border border-ink-600/70 bg-ink-900/50 text-ink-200 backdrop-blur-sm transition active:scale-[0.98] hover:border-flare-500 hover:bg-ink-800 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
            : FLOATING_ICON
        }
      >
        {pending ? (
          <Loader2 size={17} className="animate-spin" />
        ) : done ? (
          <Check size={17} className="text-fresh-500" />
        ) : (
          <MoreHorizontal size={17} />
        )}
      </button>

      {/*
        Portalled, like every other menu in the app, and for the reason the
        `Popover` comment sets out: this used to be an `absolute` panel inside
        `.rise`, which animates a transform and is therefore a permanent
        backdrop root. A frosted panel in there can only blur what is *also* in
        there — and where this menu opens, below the hero, there is nothing. So
        it had no backdrop at all, just its own flat fill.
      */}
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} align="end" width={264}>
          <div role="menu">
            {request}

            {backdrop && (
              <button
                type="button"
                onClick={() => apply(isCover)}
                className="flex w-full items-start gap-2.5 px-3 py-3 text-left text-sm text-ink-100 transition hover:bg-white/10 light:hover:bg-black/5"
              >
                {/* No colour of its own, so it is exactly the colour of the
                    label beside it. A separate grey read as a second, quieter
                    piece of information, when it is the same one. */}
                <ImageIcon size={15} className="mt-0.5 shrink-0" />
                <span>
                  {isCover ? "Remove from profile" : "Use as cover image on profile"}
                  <span className="ios-dim mt-0.5 block text-xs text-ink-400">
                    {isCover
                      ? "Your profile goes back to the plain header."
                      : "This backdrop sits behind your profile header."}
                  </span>
                </span>
              </button>
            )}

            {show && (
              <button
                type="button"
                onClick={toggleDropped}
                disabled={!show.canDrop && !dropped}
                title={
                  !show.canDrop && !dropped
                    ? "You have already seen everything there is of this one"
                    : undefined
                }
                className="flex w-full items-start gap-2.5 border-t border-white/10 light:border-ink-800 px-3 py-3 text-left text-sm text-ink-100 transition hover:bg-white/10 light:hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {dropped ? (
                  <Play size={15} className="mt-0.5 shrink-0" />
                ) : (
                  <CircleSlash size={15} className="mt-0.5 shrink-0" />
                )}
                <span>
                  {dropped ? "Start watching again" : "Stop watching"}
                  <span className="ios-dim mt-0.5 block text-xs text-ink-400">
                    {dropped
                      ? "It comes back to Up next and the calendar."
                      : "Keeps what you have watched, but stops it turning up in Up next and the calendar."}
                  </span>
                </span>
              </button>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}
