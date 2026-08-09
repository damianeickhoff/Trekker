"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect } from "react";

/**
 * Cross-fades the app between routes, using the browser's own view transitions.
 *
 * The router animates nothing on navigation: the old page is replaced by the
 * new one — or by its loading skeleton — in a single frame, which is the one
 * moment the app most looks like a web site rather than a thing in your hand.
 * `document.startViewTransition` exists for exactly this. The browser
 * photographs the outgoing page, runs the update, photographs the incoming one
 * and animates between the two — and any element carrying a
 * `view-transition-name` travels between its two positions instead of fading
 * with the rest. That last part is what turns a poster tapped in a rail into
 * the poster at the top of the title page, rather than two unrelated pictures.
 *
 * Interception is one listener on the document rather than a wrapper around
 * every `Link`. Capture phase, so it runs before Next's own click handler, and
 * `preventDefault` is how the two agree who navigates: Next checks it and
 * stands down, while everything else on the way up — menus closing themselves,
 * overlays recording a tap — still runs. A browser without the API, and a
 * reader who has asked for reduced motion, falls through to a plain
 * `router.push` and never knows this file exists.
 *
 * What cannot be wrapped is history itself: the browser's back gesture has
 * navigated before any script hears about it. So back/forward keep the
 * browser's own behaviour, and only in-app navigations animate — which is
 * most of them, and all of the ones the app is answerable for.
 */

type ViewTransitionLike = { finished: Promise<void> };

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike;
};

/**
 * Resolved the moment the new route commits. The browser holds the outgoing
 * frame on screen until this fires, so its lifetime is the length of the
 * freeze — normally one commit to a loading skeleton, not a network wait. The
 * timeout backstop below is for the navigation that never commits at all,
 * where holding the page frozen would be far worse than a missing animation.
 */
let settle: (() => void) | null = null;

function commit() {
  if (!settle) return;
  const resolve = settle;
  settle = null;
  // The card's suppression of the hero name has done its job once the old page
  // is photographed; the incoming page's own hero must have the name back
  // before the browser photographs *it*, or the poster has nowhere to land.
  delete document.documentElement.dataset.vtSource;
  resolve();
}

/**
 * Runs `navigate` inside a view transition where the browser offers one, and
 * bare where it does not. Exported for the controls that navigate from code
 * rather than from an anchor — the back button, chiefly.
 */
export function startPageTransition(
  navigate: () => void,
  options?: {
    /** Styles the crossfade for leaving rather than arriving — see globals.css. */
    kind?: "back";
    /** Runs once the transition is over, however it ended. */
    cleanup?: () => void;
  },
) {
  const doc = document as DocumentWithViewTransition;

  if (
    !doc.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    navigate();
    options?.cleanup?.();
    return;
  }

  // A click landing while the previous transition is still settling: resolve
  // the old promise so nothing waits on a page that is already gone.
  commit();

  if (options?.kind) document.documentElement.dataset.vtKind = options.kind;

  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const guard = setTimeout(commit, 1200);
        settle = () => {
          clearTimeout(guard);
          resolve();
        };
        navigate();
      }),
  );

  transition.finished.finally(() => {
    delete document.documentElement.dataset.vtKind;
    options?.cleanup?.();
  });
}

export function PageTransitions() {
  return (
    // Reading the search params opts a component out of static rendering, so
    // the reader is suspended on its own — same reasoning as `OriginProvider`.
    <Suspense fallback={null}>
      <Transitions />
    </Suspense>
  );
}

function Transitions() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  // The new route has committed — this is the earliest moment after the DOM
  // has actually changed, which is exactly what the transition is waiting on.
  // Layout effect rather than effect: the browser must be released before
  // paint, or the first frame of the new page shows outside the animation.
  useLayoutEffect(() => {
    commit();
  }, [pathname, search]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      // A modified click means a new tab, a context menu, a drag — all things
      // the browser owns and a transition would break.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      // The opt-out, for any link whose surroundings animate it themselves.
      if (anchor.closest("[data-no-transition]")) return;

      // In-app addresses only — a full URL is another site's business.
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;

      // Re-clicking the page you are on: nothing will commit, so a transition
      // would only hold the screen frozen until the backstop let go of it.
      const url = new URL(href, window.location.origin);
      if (url.pathname === location.pathname && url.search === location.search) return;

      event.preventDefault();

      /**
       * The artwork the click landed on, where the card marks one out.
       *
       * The name goes on at click time rather than living in the markup
       * because a name must be unique per photograph: a rail full of posters
       * all called `hero-art` would abort the whole transition. Named here,
       * exactly one ever carries it. `data-vt-source` suppresses the
       * *current* page's hero for the outgoing photograph only — following a
       * recommendation from one title to the next, both would otherwise claim
       * the name at once.
       *
       * Faces are a separate channel from posters, and the separation is
       * load-bearing. A person's photo and a title's hero both persist in
       * their pages' markup, so under one shared name, stepping from a person
       * to a title would pair the photo with the poster and morph somebody's
       * face into a film — continuity of the wrong thing. Two names mean a
       * poster can only ever land on a poster and a face on a face; whichever
       * side has no partner simply fades. A face also needs no
       * `data-vt-source`: no page puts a named person photo and a cast rail
       * on screen together, so there is nothing for a clicked face to fight.
       */
      const poster = anchor.querySelector<HTMLElement>("[data-shared-art]");
      const art = poster ?? anchor.querySelector<HTMLElement>("[data-shared-face]");
      if (art) {
        art.style.viewTransitionName = poster ? "hero-art" : "person-art";
        if (poster) document.documentElement.dataset.vtSource = "card";
      }

      startPageTransition(() => router.push(href), {
        cleanup: () => {
          if (art) art.style.viewTransitionName = "";
          delete document.documentElement.dataset.vtSource;
        },
      });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
