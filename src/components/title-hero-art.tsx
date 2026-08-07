"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/images";
import type { HeroColours } from "@/lib/palette";

/**
 * The artwork behind the top of a title page, at phone widths.
 *
 * Desktop keeps the older treatment — a wide backdrop dissolving into the page,
 * see `TitleBackdrop`. There the text sits *beside* the artwork rather than on
 * it, and none of what follows buys anything.
 *
 * Four layers, bottom to top:
 *
 *   fade  — a gradient from the artwork's own bottom colour, at full strength,
 *           down to the colour the page carries on in. This is the layer that
 *           makes the whole thing work, and it is the one that was missing.
 *   bed   — the plate's box, blurred and stretched down over the top of the
 *           fade. The fade alone is one colour across the width; the bed puts
 *           the film's own variation back into it, so a warm right-hand side and
 *           a cold left-hand side both carry on down.
 *   plate — the crisp image, masked out along its bottom edge.
 *   wash  — a dim over all three, so text has something to sit on.
 *
 * Why the fade is the fix. Every layer above it ends somewhere, and wherever a
 * layer ends the colour on the far side has to already be the colour it was
 * showing. The page's background is a darkened average — a third of the
 * brightness of the artwork it came from — so ending the artwork *on* the page
 * meant a step of exactly that difference. On a dark film it was small enough to
 * miss. On a bright one it was a line across the screen, and scrolling the
 * artwork under it only moved the line into better light.
 *
 * So nothing ends on the page any more. The fade starts at the artwork's real
 * bottom colour and arrives at the page's colour by the foot of the hero, and
 * every other layer dissolves into the fade well before then. The only hard
 * boundary left is the bottom of the container, where both sides are the page's
 * own colour and there is nothing to see.
 */

/** How much of the scroll the artwork keeps. 0 would pin it; 1 is no effect. */
const DEPTH = 0.4;
/** Past this the hero is off screen and there is nothing left to shift. */
const LIMIT = 640;

/** The artwork's full height, and the two plate heights, as one set of figures. */
const HEIGHT = 600;
const PLATE = { wide: 324, tall: 504 };

export function TitleHeroArt({
  backdrop,
  poster,
  colours,
}: {
  backdrop: string | null;
  poster: string | null;
  /** Sampled from the same artwork; null when there was none to sample. */
  colours: HeroColours | null;
}) {
  // The backdrop is the first choice. Where there is none the poster stands in —
  // and because every layer is built from whichever image this is, the fade
  // matches either without anything else changing. Worked out before the hooks
  // because one of them watches it, and a `const` below would be in its
  // temporal dead zone by the time that hook read it.
  const wide = img.backdrop(backdrop, "w1280");
  const src = wide ?? img.poster(poster, "w780");

  const ref = useRef<HTMLDivElement>(null);
  /**
   * Whether the picture is actually on screen yet.
   *
   * The zoom used to start on mount, which is the wrong moment: the artwork is
   * a network request away, and by the time it arrived the animation had
   * usually already played to something nobody could see. Waiting for the load
   * means the settle happens *to the image*, which is the only version of it
   * worth having. A cached image reports itself loaded immediately, so a second
   * visit still gets the movement rather than skipping it.
   */
  const [shown, setShown] = useState(false);
  const plateImage = useRef<HTMLImageElement>(null);

  /**
   * An `onLoad` prop was not enough, and this is the reason.
   *
   * The artwork is marked `priority`, so Next preloads it in the document head.
   * On any second visit — and often on the first — it is finished before React
   * has attached a single handler, the `load` event has already come and gone,
   * and `onLoad` never fires. Which left the image held at its opening frame
   * forever: permanently 12% too big, with no animation to bring it back.
   *
   * `complete` is the question that has an answer either way. The timeout is the
   * backstop for an image that fails outright, where holding the zoom would be a
   * visible mistake rather than a missing flourish.
   */
  useEffect(() => {
    const image = plateImage.current;
    if (!image) return;

    if (image.complete) {
      setShown(true);
      return;
    }

    const done = () => setShown(true);
    image.addEventListener("load", done);
    image.addEventListener("error", done);
    const guard = setTimeout(done, 4000);

    return () => {
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
      clearTimeout(guard);
    };
  }, [src]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const apply = () => {
      frame = 0;
      const y = Math.min(window.scrollY, LIMIT);
      element.style.transform = `translate3d(0, ${y * DEPTH}px, 0)`;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  if (!src) return null;

  const plate = wide ? PLATE.wide : PLATE.tall;
  /** Where the plate ends, as a percentage of the artwork. Every layer's stops
      are expressed against this: it is the one place the image stops being a
      picture and starts being a colour. */
  const foot = Math.round((plate / HEIGHT) * 100);
  /** Halfway from there to the foot of the hero, where the fade is held back. */
  const half = Math.round(foot + (100 - foot) / 2);

  return (
    <div
      aria-hidden
      // Pulled up past everything between here and the top of the window, so the
      // artwork runs off it rather than starting under a band of plain
      // background: a title page hides the nav on a phone and drops the main
      // element's top padding, leaving the back button's row (42px) and the
      // status bar inset in the installed app.
      //
      // Then another 24px on top of that. The figure above is only as good as
      // the assumptions in it, and the cost of being wrong in either direction
      // is not symmetric — too much simply runs off the top of the document
      // where nobody can see it, too little is a bar of bare page above the
      // artwork.
      className="pointer-events-none absolute -top-[calc(66px_+_env(safe-area-inset-top))] left-1/2 -z-10 h-[600px] w-screen -translate-x-1/2 sm:hidden"
    >
      <div ref={ref} className="relative h-full w-full will-change-transform">
        {colours && (
          // Held at the edge colour for the whole of the plate's own height —
          // where it is behind an opaque image and cannot be seen — so that the
          // travel from artwork to page happens entirely below the picture,
          // across the full remaining height rather than at a boundary.
          //
          // The middle stop is what keeps it from reading as dark. A straight
          // ramp is already halfway to the page's colour halfway down, which put
          // the darkest part of the journey directly behind the title. Holding
          // it at 78% of the artwork's own colour there leaves the fall to the
          // last stretch, where there is nothing to sit on it.
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(to bottom, ${colours.edge} 0%, ${colours.edge} ${foot}%, color-mix(in oklab, ${colours.edge} 78%, ${colours.tint}) ${half}%, ${colours.tint} 100%)`,
            }}
          />
        )}

        {/*
          The bed is the plate's own box, stretched down over the fade.

          Same box, so the colours directly beneath the plate's bottom edge are
          the colours of that edge. Nothing scales it horizontally either: a
          fifth of a screen of drift is a fifth of a screen of mismatch right
          where the two layers cross. The blur does pull a little transparency in
          at the sides, and what shows through there is the fade — which is this
          same image's average, so it is the colour that was going to be there.

          It is masked out by the time the fade has any work to do, which keeps
          the bottom half of the hero a single smooth gradient rather than a
          blurred image arguing with one.
        */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            maskImage: `linear-gradient(to bottom, #000 0%, #000 ${foot}%, transparent ${Math.min(foot + 26, 100)}%)`,
            WebkitMaskImage: `linear-gradient(to bottom, #000 0%, #000 ${foot}%, transparent ${Math.min(foot + 26, 100)}%)`,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 origin-top"
            style={{ height: plate, transform: `scaleY(${(HEIGHT / plate).toFixed(2)})` }}
          >
            <Image
              src={src}
              alt=""
              fill
              priority
              sizes="100vw"
              className={`hero-zoom object-cover object-top blur-[28px] ${shown ? "hero-zoom-run" : ""}`}
            />
          </div>
        </div>

        <div className="hero-plate absolute inset-x-0 top-0" style={{ height: plate }}>
          {/* A 16:9 still cropped to the full height of a phone hero is a 70%
              zoom into the middle of it. Held to a shallower box it stays
              recognisable, and everything below carries its colour on. */}
          <Image
            src={src}
            alt=""
            fill
            priority
            sizes="100vw"
            ref={plateImage}
            className={`hero-zoom object-cover object-top ${shown ? "hero-zoom-run" : ""}`}
          />
        </div>

        <div className="hero-wash absolute inset-0" />
      </div>
    </div>
  );
}
