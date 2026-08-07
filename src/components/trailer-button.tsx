"use client";

import { Film, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The trailer, from the action row.
 *
 * Desktop only, and a deliberate second way in. The page carries a proper
 * player further down — see `TitleTrailer` — which is where the trailer belongs
 * when you are reading about a film. But desktop keeps the whole action row in
 * view at the top of the page, and "show me the trailer" is one of the things
 * people arrive wanting; making them scroll past the cast to find it was worse
 * than a button.
 *
 * A phone has neither the width in that row nor the same problem: the tabs put
 * the trailer two taps away wherever you are.
 */
export function TrailerButton({ videoKey, title }: { videoKey: string; title: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Play the ${title} trailer`}
        // Matches the heart and the overflow menu it sits between, rather than
        // the labelled pills before them: three squares in a row, one of them
        // suddenly a sentence, is what the old layout looked like.
        className="hidden h-[50px] w-[50px] shrink-0 place-items-center rounded-xl border border-ink-600/70 bg-ink-900/50 text-ink-200 backdrop-blur-sm transition active:scale-[0.98] hover:border-flare-500 hover:bg-ink-800 sm:grid light:border-ink-600 light:bg-white/85 light:hover:bg-white"
      >
        <Film size={17} />
      </button>

      {/*
        Portalled to the body. `position: fixed` is only viewport-relative when
        no ancestor has a transform, filter or backdrop-filter — the hero has all
        three around it, which would otherwise pin this to the page rather than
        to the current view.
      */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal
            aria-label={`${title} trailer`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-6"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/60"
            >
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
                title={`${title} trailer`}
                allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close trailer"
              className="absolute top-4 right-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={18} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
