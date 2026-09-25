"use client";

import { createContext, useCallback, useContext, useState, useTransition, type ReactNode } from "react";
import { redateWatch } from "@/lib/play-actions";
import { Icon } from "../icon";
import { EXIT, usePresence } from "../presence";
import { PRESS } from "../motion";

/**
 * "When did you watch it?", offered after a tick. A tick means now; the menu
 * is for the evening it actually happened. Choosing overwrites the timestamp
 * of the viewing just logged. Ignoring it costs nothing: it goes away by
 * itself, and the tick stands as "now".
 *
 * It lives above the card rather than inside it, because the card moves on to
 * the next episode the moment the tick lands, and the menu has to outlast that.
 *
 * Its lifetime is the bar along its foot, which drains over five seconds: the
 * bar's own animation is the timer, so pausing one pauses the other and they
 * can never disagree. A pointer over it, a touch on it, keyboard focus in it or the
 * date picker being open holds it. Choosing closes it at once; the move is
 * made behind it, and only a failure brings it back.
 */

type Offer = { playId: string; label: string };

const OfferContext = createContext<(offer: Offer) => void>(() => {});

export function useOfferWhen() {
  return useContext(OfferContext);
}

/** Today in the browser's own calendar, which is what "yesterday" means to the person holding it. */
function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * `redate` is the action that moves the play. Home's holds the show's place in
 * Up next like the tick it corrects; a title page passes its own, which lets
 * the move reorder Up next as any viewing from there does.
 */
export function WhenMenuProvider({
  children,
  redate = redateWatch,
}: {
  children: ReactNode;
  redate?: (playId: string, day: string) => Promise<boolean>;
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [status, setStatus] = useState<"asking" | "earlier" | "failed">("asking");
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [, startTransition] = useTransition();
  const [earlier, setEarlier] = useState(() => localDay(-3));
  // Bumped on every opening, so the bar restarts even for the same play.
  const [opening, setOpening] = useState(0);

  const open = useCallback((next: Offer, nextStatus: "asking" | "failed" = "asking") => {
    setOffer(next);
    setStatus(nextStatus);
    setHovered(false);
    setTouched(false);
    setFocused(false);
    setOpening((n) => n + 1);
  }, []);

  const offerWhen = useCallback((next: Offer) => open(next), [open]);

  function choose(day: string) {
    if (!offer) return;
    const chosen = offer;
    setOffer(null);
    startTransition(async () => {
      const ok = await redate(chosen.playId, day);
      if (!ok) open(chosen, "failed");
    });
  }

  const held = hovered || touched || focused || status === "earlier";
  // The offer it showed, kept while it leaves (`motion-pop`, from the corner it stands in).
  const { mounted, state } = usePresence(offer !== null, EXIT.fast);
  const [kept, setKept] = useState<Offer | null>(offer);
  if (offer && offer !== kept) setKept(offer);
  const shown = offer ?? kept;

  const chip = `${PRESS} inline-flex h-9 items-center rounded-full bg-white/12 px-3.5 text-[13px] font-semibold text-white`;

  return (
    <OfferContext.Provider value={offerWhen}>
      {children}
      {mounted && shown && (
        <div
          role="dialog"
          aria-label="When did you watch it?"
          data-state={state}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
          // No hover on glass: a touch is the sign someone is using it, and it
          // holds until they choose or close, since lifting the finger is not leaving.
          onPointerDown={(e) => e.pointerType !== "mouse" && setTouched(true)}
          // Keyboard focus only: a click focuses its button too, and that alone
          // should not keep the menu up once the pointer has gone.
          onFocus={(e) => e.target.matches(":focus-visible") && setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
          }}
          className="motion-pop fixed inset-x-4 bottom-[calc(var(--tab-bar-clearance)_-_14px)] z-(--z-sheet) flex origin-bottom lg:origin-bottom-right flex-col gap-2.5 overflow-hidden rounded-[20px] bg-pill p-3.5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] lg:inset-x-auto lg:bottom-8 lg:right-8 lg:w-[380px]"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 grow truncate text-[13px] text-white/78">
              {status === "failed" ? "Could not move it. " : "Watched "}
              <span className="font-semibold text-white">{shown.label}</span>
            </span>
            <button
              type="button"
              onClick={() => setOffer(null)}
              aria-label="Close"
              className={`${PRESS} inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/70`}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
          {(status === "asking" || status === "failed") && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-white/60">When?</span>
              <button type="button" onClick={() => choose(localDay(-1))} className={chip}>
                Yesterday
              </button>
              <button type="button" onClick={() => choose(localDay(-2))} className={chip}>
                2 days ago
              </button>
              <button type="button" onClick={() => setStatus("earlier")} className={chip}>
                Earlier
              </button>
            </div>
          )}
          {status === "earlier" && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                choose(earlier);
              }}
            >
              <label className="flex min-w-0 grow">
                <span className="sr-only">Day watched</span>
                <input
                  type="date"
                  required
                  max={localDay(0)}
                  value={earlier}
                  onChange={(e) => setEarlier(e.target.value)}
                  className="h-9 min-w-0 grow rounded-full border-0 bg-white/12 px-3.5 text-[13px] text-white [color-scheme:dark]"
                />
              </label>
              <button
                type="submit"
                className={`${PRESS} inline-flex h-9 items-center rounded-full bg-white px-3.5 text-[13px] font-semibold text-black`}
              >
                Save
              </button>
            </form>
          )}
          <span
            key={opening}
            aria-hidden="true"
            onAnimationEnd={() => setOffer(null)}
            style={{ animationPlayState: held ? "paused" : "running" }}
            className="when-drain absolute inset-x-0 bottom-0 h-[3px] bg-white/45"
          />
        </div>
      )}
    </OfferContext.Provider>
  );
}
