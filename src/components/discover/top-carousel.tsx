"use client";

import { useRef, type ReactNode } from "react";
import type { Mark } from "@/lib/marks";
import { dwellName, nextIndex, previousIndex, running, swipeStep, type CarouselState } from "@/lib/spotlight";
import { StatusMark } from "../artwork";
import { Icon } from "../icon";
import { Link } from "../link";
import { PRESS, ZOOM_GROUP } from "../motion";
import { Poster } from "../poster";
import { ArtChip } from "../ui";
import styles from "./carousel.module.css";
import { useCarousel } from "./use-carousel";

export type SpotlightItem = {
  key: string;
  href: string;
  title: string;
  /** The wide artwork; the poster, cropped to its top, when TMDB has none. */
  backdrop: string | null;
  poster: string | null;
  score: number;
  /** "Film · 2026" on desktop; with up to two genres on a phone. */
  meta: string;
  /** The synopsis from the trending answer. */
  overview: string;
  mark: Mark;
};

/**
 * The slow zoom's wrapper round a slide's artwork: named keyframes while the
 * slide shows or fades out (`dwellName`), held while the carousel is paused.
 * `zoom-art` gives its clipping frame a layer of its own, as the hover zoom's
 * pictures have, so Chrome keeps the rounded corners while it scales.
 */
export function DwellArt({ state, i, children }: { state: CarouselState; i: number; children: ReactNode }) {
  const name = dwellName(state, i);
  return (
    <span
      aria-hidden="true"
      data-dwell={name ?? undefined}
      data-held={name && !running(state) ? "" : undefined}
      className={`zoom-art absolute inset-0 ${styles.dwell}`}
    >
      {children}
    </span>
  );
}

/** A dot's box: a 22px target round a 7px dot. The amber one is a single dot sliding between them. */
const DOT_BOX = 22;

/**
 * The carousel's frame, shared by Discover's top three and the News page's
 * lead stories (Round 10): the region, its pause on a pointer, a finger, focus
 * or a hidden tab (`useCarousel`), the sideways swipe where `swipe` is on,
 * and the dots bottom-right with the amber one sliding between them. The
 * slides are the caller's, drawn from the state (`render`), each laid out as
 * a `styles.slide` with its `picture` and `words` layers.
 */
export function CarouselFrame({
  count,
  label,
  dotLabel,
  swipe,
  className,
  dotsClassName,
  render,
}: {
  count: number;
  label: string;
  dotLabel: (i: number) => string;
  swipe: boolean;
  className: string;
  /** Where the dots sit: the corner, inset as the card's padding is. */
  dotsClassName: string;
  render: (state: CarouselState) => ReactNode;
}) {
  const [state, send] = useCarousel(count);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => send({ type: "hover", on: true })}
      onPointerLeave={() => send({ type: "hover", on: false })}
      onFocus={() => send({ type: "focus", on: true })}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) send({ type: "focus", on: false });
      }}
      onPointerDown={(e) => {
        swiped.current = false;
        start.current = swipe ? { x: e.clientX, y: e.clientY } : null;
      }}
      onPointerUp={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const step = swipeStep(e.clientX - from.x, e.clientY - from.y);
        if (step === 0) return;
        swiped.current = true;
        send({ type: "jump", index: step === 1 ? nextIndex(state.index, state.count) : previousIndex(state.index, state.count) });
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      // A swipe that ends over the card is not a tap on its link.
      onClickCapture={(e) => {
        if (!swiped.current) return;
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={className}
    >
      {render(state)}
      {count > 1 && (
        <div className={`absolute z-(--z-lift) flex items-center ${dotsClassName}`}>
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={dotLabel(i)}
              aria-current={i === state.index ? "true" : undefined}
              onClick={() => send({ type: "jump", index: i })}
              className="group/dot flex size-[22px] items-center justify-center border-0 bg-transparent p-0"
            >
              <span className="block size-[7px] rounded-full bg-white/45 transition-colors duration-(--fast) ease-out group-hover/dot:bg-white/78" />
            </button>
          ))}
          {/* The amber, one dot sliding to the slide showing over `--base`; a cut with reduced motion. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[7.5px] top-[7.5px] size-[7px] rounded-full bg-accent transition-[translate] duration-(--base) ease-out"
            style={{ translate: `${state.index * DOT_BOX}px 0` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Discover's top three (Round 9 and its follow-ups), the same carousel at
 * both widths: the desktop's big card beside #4 and #5 (`desk`), and the
 * phone's card on the hero (`phone`, the column's width and 300px tall). #1,
 * #2 and #3 in turn, seven seconds each counted from the start of each
 * change: the pictures crossfade over 1.2s on `--ease-in-out`, each zooming
 * the whole time, and the words give way in two steps so they never overlap
 * (`carousel.module.css`). Three dots bottom-right say which is showing, the
 * amber one sliding between them, and jump to one; on a phone a sideways
 * swipe steps to the next or previous slide.
 *
 * A pointer or a finger on the card pauses it, and so do focus inside it and
 * a hidden tab; each change of slide restarts the dwell. With reduced motion
 * it never advances and nothing zooms or fades, #1 shows and the dots still
 * step. Allowed to run by itself because it is a hero: looked at, and paused
 * whenever it is not (STYLE.md, Motion). The frame is `CarouselFrame`.
 */
export function TopCarousel({ items, size }: { items: SpotlightItem[]; size: "desk" | "phone" }) {
  const phone = size === "phone";
  return (
    <CarouselFrame
      count={items.length}
      label="Top three this week"
      dotLabel={(i) => `Show #${i + 1}, ${items[i].title}`}
      swipe={phone}
      dotsClassName={phone ? "bottom-3 right-3" : "bottom-5 right-5"}
      className={`relative min-w-0 overflow-hidden rounded-2xl bg-night ${
        phone ? "h-[300px] touch-pan-y shadow-[0_16px_40px_rgba(0,0,0,0.45)]" : "h-full shadow-elevation"
      }`}
      render={(state) => items.map((item, i) => <Slide key={item.key} item={item} rank={i + 1} state={state} i={i} phone={phone} />)}
    />
  );
}

/**
 * One slide: the whole card is its link, only while it is showing. Its
 * picture and its words are separate layers on separate clocks
 * (`carousel.module.css`); the showing slide sits on top.
 */
function Slide({ item, rank, state, i, phone }: { item: SpotlightItem; rank: number; state: CarouselState; i: number; phone: boolean }) {
  const showing = i === state.index;
  const wide = Boolean(item.backdrop);
  return (
    <Link
      href={item.href}
      aria-label={`#${rank} this week: ${item.title}`}
      aria-hidden={showing ? undefined : true}
      inert={!showing}
      data-state={showing ? "showing" : i === state.prev ? "leaving" : "idle"}
      className={`${ZOOM_GROUP} ${styles.slide} absolute inset-0 flex ${showing ? "z-(--z-lift)" : ""}`}
    >
      <span aria-hidden="true" className={`${styles.picture} absolute inset-0`}>
        <DwellArt state={state} i={i}>
          <Poster
            path={item.backdrop ?? item.poster}
            alt=""
            title={item.title}
            width={phone ? (wide ? 780 : 342) : wide ? 1280 : 342}
            height={phone ? (wide ? 439 : 513) : wide ? 720 : 513}
            sizes={phone ? "calc(100vw - 40px)" : "(min-width: 117.5rem) 60vw, 760px"}
            priority={rank === 1}
            className={`size-full ${wide ? "" : "object-[center_22%]"}`}
          />
        </DwellArt>
        <span className="absolute inset-0 bg-linear-to-b from-black/0 from-20% to-black/85" />
      </span>
      <span className={`${styles.words} absolute inset-0 flex`}>
        <span className={`absolute flex ${phone ? "left-3 top-3" : "left-5 top-5"}`}>
          <ArtChip small>#{rank} this week</ArtChip>
        </span>
        {item.score > 0 && (
          <span className={`absolute flex ${phone ? "right-3 top-3" : "right-5 top-5"}`}>
            <ArtChip small>{item.score}%</ArtChip>
          </span>
        )}
        <span
          className={`relative mt-auto flex w-full min-w-0 flex-col text-white ${
            phone ? `gap-1.5 p-4 ${item.mark ? "pr-11" : ""}` : "gap-2 p-7 pr-24"
          }`}
        >
          <span className="truncate text-[11px] text-white/78">{item.meta}</span>
          <span
            className={`line-clamp-2 font-display font-extrabold text-balance ${
              phone ? "text-[26px] leading-[0.98] tracking-[-0.035em]" : "text-[40px] leading-none tracking-[-0.03em]"
            }`}
          >
            {item.title}
          </span>
          {item.overview && (
            <span className={`line-clamp-2 text-white/78 ${phone ? "text-[13px] leading-[1.4]" : "max-w-[560px] text-[13px] leading-[1.45]"}`}>
              {item.overview}
            </span>
          )}
          <span
            className={`${PRESS} mt-1.5 inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-black group-hover/zoom:bg-white/88 motion-safe:group-active/zoom:scale-[0.97]`}
          >
            View details
            <Icon name="chevR" size={14} />
          </span>
        </span>
        {/* Above the dots, which take the corner. */}
        {item.mark && (
          <span className={`absolute flex ${phone ? "bottom-11 right-3" : "bottom-12 right-5"}`}>
            <StatusMark mark={item.mark} />
          </span>
        )}
      </span>
    </Link>
  );
}
