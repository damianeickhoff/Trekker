"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { img } from "@/lib/images";
import type { HeroColours } from "@/lib/palette";

/**
 * Full-bleed artwork behind the top of a title page. It reaches up under the
 * sticky header and dissolves with a mask, so there is no visible edge where
 * the image stops — only the page background showing through.
 *
 * A client component for one reason: the settle. The artwork eases from a
 * touch over full size down to rest as it arrives — the same gesture the
 * phone hero makes, at desktop scale — and the animation has to wait for the
 * picture, not for the mount. The gating is the same `complete` check
 * `TitleHeroArt` explains: the image is preloaded from the document head, so
 * on a warm cache the `load` event has come and gone before React attaches a
 * handler.
 */
export function TitleBackdrop({
  backdrop,
  colours,
}: {
  backdrop: string | null;
  /** Sampled from the artwork, for the glow beneath it. Null when unusable. */
  colours?: HeroColours | null;
}) {
  const src = img.backdrop(backdrop, "w1280");

  const image = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = image.current;
    if (!element) return;

    if (element.complete) {
      setShown(true);
      return;
    }

    const done = () => setShown(true);
    element.addEventListener("load", done);
    element.addEventListener("error", done);
    // A picture that never arrives should settle anyway rather than sit
    // enlarged forever.
    const guard = setTimeout(done, 4000);

    return () => {
      element.removeEventListener("load", done);
      element.removeEventListener("error", done);
      clearTimeout(guard);
    };
  }, [src]);

  if (!src) return null;

  return (
    <div
      aria-hidden
      // -top-20/-top-24 pulls it up behind the sticky header and the main
      // element's own top padding; w-screen escapes the max-width container.
      //
      // Taller on a phone than it was — 420px put the whole hero above the
      // fold's worth of content, so the fade had nowhere to go but across the
      // title. The mask in globals.css holds to 62% of this, which is what
      // decides where the dissolve actually lands.
      className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-[560px] w-screen -translate-x-1/2 sm:-top-24 sm:h-[620px]"
    >
      {/*
        The film's own colour, carried past the artwork's dissolve.

        The fade over the image ends on the app's near-black, which meant the
        desktop page went back to being violet the moment the picture ran out
        — the one thing the phone hero was rebuilt to stop doing. This is the
        modest desktop version of the same idea: the sampled tint, as a soft
        bloom under and beyond the artwork, so the page below the hero leans
        towards the film instead of snapping back to the app. Behind the image
        in the stack, so it only shows where the mask has let the picture go.
      */}
      {colours && (
        <div
          className="absolute inset-x-0 top-1/4 -bottom-28"
          style={{
            backgroundImage: `radial-gradient(75% 70% at 50% 38%, ${colours.tint} 0%, transparent 72%)`,
            opacity: 0.5,
          }}
        />
      )}

      {/* `overflow-hidden` clips the enlarged opening frame of the settle,
          which would otherwise poke out past the mask's edges. */}
      <div className="title-backdrop relative h-full w-full overflow-hidden">
        <Image
          ref={image}
          src={src}
          alt=""
          fill
          priority
          sizes="100vw"
          className={`hero-zoom-soft object-cover object-top ${shown ? "hero-zoom-run" : ""}`}
        />
        <div className="title-backdrop-fade absolute inset-0" />
      </div>
    </div>
  );
}
