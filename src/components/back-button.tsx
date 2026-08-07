"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useOrigin } from "./origin";

/**
 * The look every control floating over the hero artwork shares — the way back,
 * the trailer, the overflow menu.
 *
 * Glass, and it only works because of where these are mounted. `backdrop-filter`
 * samples the *backdrop root* — everything painted beneath the element, but only
 * as far up as the nearest ancestor that establishes one. Any ancestor with a
 * transform, a filter, or an animation touching either becomes that boundary.
 *
 * These used to sit inside `.rise`, the page-entry animation, which animates
 * opacity and transform with `fill-mode: both` — so it is a backdrop root for
 * the life of the page. The artwork blurred (it lives inside the article, at
 * `-z-10`) and everything else did not. Mounting the row *outside* the animated
 * wrapper puts the whole page in the backdrop again, which is what the blur was
 * always meant to see. Keep it that way — see `BackButton`'s note.
 *
 * The blur is deliberately strong: at 12px, text behind a 60% fill is still
 * legible enough to read as a bug rather than as frosting.
 */
/**
 * The material on its own — fill, border, blur, shadow, text colour — with no
 * radius, no size and no hover. Split out so anything that should be made of the
 * same stuff inherits changes to it rather than copying a class list.
 *
 * The radius is not in here because a panel is not a capsule: the phone's search
 * sheet is this material at `rounded-3xl`, and a `rounded-full` baked in would
 * be a second border-radius utility racing it with nothing to say which wins.
 */
export const FLOATING_MATERIAL =
  "ios-surface touch-manipulation border border-ink-600/80 bg-ink-800/60 text-ink-100 shadow-lg shadow-black/40 backdrop-blur-2xl backdrop-saturate-150 light:border-ink-600 light:bg-white/60 light:shadow-black/15";

/** The material as a capsule: the tab bar, and every floating control. */
export const FLOATING_SURFACE = `${FLOATING_MATERIAL} rounded-full`;

export const FLOATING_CONTROL = `${FLOATING_SURFACE} pointer-events-auto inline-flex h-[42px] items-center gap-1 text-sm transition hover:border-ink-500 hover:bg-ink-700/70 light:hover:bg-white/80`;

/** The same, sized for a single glyph. */
export const FLOATING_ICON = `${FLOATING_CONTROL} w-[42px] justify-center`;

/**
 * Goes back one entry. `router.back()` silently does nothing when there is no
 * entry to return to — which is the normal case for a PWA cold start, or a
 * shared link opened in a new tab — so if the route has not changed shortly
 * after, fall forward to a sensible page instead of appearing broken.
 *
 * Mount this *outside* the page's `.rise` wrapper, not inside it. `.rise`
 * animates transform and opacity with `fill-mode: both`, which makes it a
 * permanent backdrop root — and a backdrop root is the ceiling on what the glass
 * here can see through. Inside it, the blur found the hero artwork and nothing
 * else.
 */
export function BackButton({
  fallback = "/discover",
  to = "origin",
  title,
  actions,
}: {
  fallback?: string;
  /** Centred in the row, for a page that is one of many under something else. */
  title?: string;
  /**
   * `origin` leaves the whole chain of titles and returns to the page it
   * started from. `back` is a single step, for a page opened *from* a title —
   * a cast member, a full cast list — where the thing you want back is the one
   * you were just reading. `href` always lands on `fallback`, for a page you
   * can arrive at several ways and leave only one: swiping through six episodes
   * should still put you back on the show, not on the fifth of them.
   */
  to?: "origin" | "back" | "href";
  /**
   * Controls for the far end of the row. They belong here rather than down in
   * the button row because they are chrome for the page, not actions on the
   * title — and two lonely buttons trailing the watch pair looked like leftovers.
   */
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const origin = useOrigin();

  /**
   * Back to where the chain started, not back one entry.
   *
   * Following a recommendation off one title onto another, and another, used to
   * mean pressing this three times to get out — through pages already read. The
   * origin is the last page that was not a title page, which is the place "back"
   * is actually asking for. `fallback` is what a caller wants when there is no
   * such place: a cold start on a shared link has no history to return to.
   *
   * `push` rather than `back`: the number of entries to unwind is not knowable,
   * and guessing it wrong navigates somewhere nobody asked for. Going forwards
   * to a known destination always lands.
   */
  function goBack() {
    if (to === "origin") {
      router.push(origin || fallback);
      return;
    }

    if (to === "href") {
      router.push(fallback);
      return;
    }

    // A cold start on a shared link has no entry to go back to, so the history
    // length is what decides whether `back` means anything here.
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  }

  return (
    // Sticks just below the nav so the way out is always to hand, however far
    // down a title page you have read. The wrapper is transparent and ignores
    // pointer events, so only the button itself sits over the content.
    //
    // `back-row` is the hook a title page uses to pull this up to the top of the
    // window, where it has no nav to sit under. See the `.title-page` block in
    // `globals.css`.
    <div className="back-row pointer-events-none relative sticky top-[4.5rem] z-30 mb-3 flex items-center justify-between gap-2">
      <button type="button" onClick={goBack} className={`${FLOATING_CONTROL} pr-4 pl-3`}>
        <ChevronLeft size={16} />
        Back
      </button>

      {/* Centred against the row rather than placed between the two controls,
          so it does not shift when one of them is absent. */}
      {title && (
        <span className="pointer-events-none absolute inset-x-0 truncate text-center text-sm font-semibold">
          {title}
        </span>
      )}

      {actions && <div className="pointer-events-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
