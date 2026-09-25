"use client";

import styles from "../discover/carousel.module.css";
import { CarouselFrame, DwellArt } from "../discover/top-carousel";
import type { PressRow } from "@/lib/press";
import { tagLabel } from "@/lib/news-words";
import type { CarouselState } from "@/lib/spotlight";
import { StateChip } from "../ui";
import { NewsPicture } from "./no-picture";
import { TitleLink, type Relation } from "./press-cards";

export type LeadSlide = { row: PressRow; relation: Relation; age: string };

const out = (link: string) => ({ href: link, target: "_blank", rel: "noopener noreferrer" }) as const;

/**
 * The lead stories (Round 10, fourth review): the three newest headlines the
 * lead's rule allows, as a carousel with Discover's top three's mechanics and
 * look, from the same pieces (`CarouselFrame`, `DwellArt`,
 * `carousel.module.css`, `useCarousel`): seven seconds a slide, the picture
 * zooming slowly, a 1.2s crossfade, the words giving way in two steps, paused
 * under a pointer or finger, with focus inside and in a hidden tab, a
 * sideways swipe, and the dots bottom-right. With reduced motion it never
 * advances and the dots still step. No animation loop: a `setTimeout` chain
 * and CSS.
 *
 * Each slide is the lead card as before: 16:9 on desktop, 7:6 on a phone,
 * the kind chip and "Lead story", the headline in the display face, the
 * summary line, the byline and the named title. The picture and the headline
 * go out to the article in a new tab; the title goes into Trekker.
 */
export function LeadCarousel({ slides }: { slides: LeadSlide[] }) {
  return (
    <CarouselFrame
      count={slides.length}
      label="Lead stories"
      dotLabel={(i) => `Show lead story ${i + 1}: ${slides[i].row.headline}`}
      swipe
      dotsClassName="bottom-3 right-3 lg:bottom-5 lg:right-5"
      className="relative aspect-[7/6] min-w-0 touch-pan-y overflow-hidden rounded-[22px] bg-night lg:aspect-video"
      render={(state) => slides.map((slide, i) => <Slide key={slide.row.id} slide={slide} state={state} i={i} />)}
    />
  );
}

function Slide({ slide, state, i }: { slide: LeadSlide; state: CarouselState; i: number }) {
  const { row, relation, age } = slide;
  const showing = i === state.index;
  return (
    <div
      aria-hidden={showing ? undefined : true}
      inert={!showing}
      data-state={showing ? "showing" : i === state.prev ? "leaving" : "idle"}
      className={`${styles.slide} absolute inset-0 ${showing ? "z-(--z-lift)" : ""}`}
    >
      <a {...out(row.link)} tabIndex={-1} aria-hidden="true" className={`${styles.picture} absolute inset-0 block`}>
        <DwellArt state={state} i={i}>
          <NewsPicture imageUrl={row.imageUrl} source={row.source} sizes="(min-width: 64rem) 800px, 100vw" mark={56} eager={i === 0} still />
        </DwellArt>
        <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_30%,rgba(0,0,0,0.55)_62%,rgba(0,0,0,0.88)_100%)]" />
      </a>
      <div
        className={`${styles.words} pointer-events-none absolute inset-x-[18px] bottom-[18px] flex flex-col gap-2 pr-16 text-white lg:inset-x-7 lg:bottom-[26px] lg:gap-2.5 lg:pr-20`}
      >
        <span className="flex items-center gap-1.5">
          {row.tag && <StateChip small>{tagLabel(row.tag)}</StateChip>}
          <span className="inline-flex h-5 items-center rounded-md bg-black/45 px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-white">
            Lead story
          </span>
        </span>
        <a
          {...out(row.link)}
          className="pointer-events-auto line-clamp-2 max-w-[720px] font-display text-[22px] font-extrabold leading-[1.02] tracking-[-0.03em] text-white hover:underline lg:text-4xl"
        >
          {row.headline}
        </a>
        {row.summary && <span className="hidden max-w-[640px] text-[15px] leading-[1.4] text-white/80 sm:line-clamp-2">{row.summary}</span>}
        <span className="pointer-events-auto flex min-w-0 items-center gap-3.5 pt-0.5">
          <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-white/75">
            {row.source} · {age}
          </span>
          <TitleLink row={row} relation={relation} lead />
        </span>
      </div>
    </div>
  );
}
