"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";
import { Presence, usePresenceState } from "./presence";

/*
 * A trailer, played here rather than on YouTube: a press opens it over the
 * page, on black, at 16:9 as wide as the screen allows, playing at once. ✕,
 * Escape or a press on the black around it closes it, and closing stops it,
 * since the player goes with the overlay. The embed is YouTube's
 * privacy-enhanced one (youtube-nocookie.com), so nothing is stored until it
 * plays. Every trailer TMDB lists that Trekker opens is on YouTube.
 */

/** The embed for a YouTube key: autoplay (the press is the gesture that allows it), inline on iOS, no related videos from other channels. */
export function trailerEmbed(key: string) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1&playsinline=1&rel=0`;
}

/** A button that plays a trailer over the page. Styled by the caller, as the link it replaces was. */
export function TrailerButton({
  videoKey,
  title,
  className,
  label,
  role,
  children,
}: {
  videoKey: string;
  /** What the trailer is for, for the player's name: "Trailer: Inception". */
  title: string;
  className?: string;
  /** For a button that is only an icon. */
  label?: string;
  /** "listitem" where it stands in a rail. */
  role?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} role={role} onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <Presence open={open}>
        <TrailerOverlay videoKey={videoKey} title={title} onClose={() => setOpen(false)} />
      </Presence>
    </>
  );
}

function TrailerOverlay({ videoKey, title, onClose }: { videoKey: string; title: string; onClose: () => void }) {
  const state = usePresenceState();
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Focus to ✕ and back where it was after; Escape closes; the page under it holds still.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trailer: ${title}`}
      data-state={state}
      className="motion-scrim fixed inset-0 z-(--z-sheet) flex items-center justify-center bg-black/90 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-[calc(var(--safe-top,0px)+64px)] sm:px-10 sm:pb-10"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        ref={closeButton}
        type="button"
        aria-label="Close trailer"
        onClick={onClose}
        className="absolute right-4 top-[calc(var(--safe-top,0px)+12px)] inline-flex size-10 items-center justify-center rounded-full border-0 bg-white/16 text-white transition-colors duration-(--fast) ease-out hover:bg-white/26"
      >
        <Icon name="x" size={20} />
      </button>
      <div data-state={state} className="motion-sheet aspect-video w-full max-w-[min(1280px,calc((100dvh-140px)*16/9))] overflow-hidden rounded-xl bg-black shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <iframe
          src={trailerEmbed(videoKey)}
          title={`Trailer: ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="block size-full border-0"
        />
      </div>
    </div>,
    document.body,
  );
}
