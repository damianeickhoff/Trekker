"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Icon } from "../icon";
import { Link } from "../link";
import { Poster } from "../poster";
import { EXIT } from "../presence";
import { buttonClass } from "../ui";
import { PRESS } from "../motion";

export type Option = {
  value: string;
  label: string;
  hint?: string;
  /** Where choosing it and pressing Next goes. */
  href: string;
  /** A mood's artwork, when the cache has some. Without it the tile is the placeholder. */
  poster?: string | null;
};

/*
 * Moving between questions. Next slides the question out to the left and
 * the next one in from the right, over `--base`; Back the other way. Each
 * question is its own page (the answers live in the address), so the way
 * travelled is left here, in the module, by the press, and read by the next
 * question as it mounts; a question opened any other way (a reload, a link)
 * finds nothing and simply shows. The exit gets `--fast` before the
 * navigation starts, so it is seen; with reduced motion there is neither the
 * wait nor the slide.
 */

type Travel = "next" | "back";
let travelled: { way: Travel; at: number } | null = null;

const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Marks the question leaving and says which way the next one should come from. */
function leave(from: Element, way: Travel) {
  travelled = { way, at: performance.now() };
  const slide = from.closest<HTMLElement>("[data-quiz-slide]");
  if (slide && !still()) slide.dataset.leaving = way;
}

/** The heading and answers of one question, arriving from the side travelled towards. */
export function QuizSlide({ children }: { children: ReactNode }) {
  // Read once, at mount: a press within the last few seconds brought this question here.
  const [way] = useState<Travel | null>(() => {
    const t = typeof window === "undefined" ? null : travelled;
    return t && performance.now() - t.at < 5000 ? t.way : null;
  });
  // Spent once this question has shown, so a reload or a link later does not slide.
  useEffect(() => {
    travelled = null;
  }, []);
  const from: CSSProperties | undefined = way ? ({ "--motion-from": way === "next" ? "24px" : "-24px" } as CSSProperties) : undefined;
  return (
    <div data-quiz-slide="" data-travel={way === "back" ? "prev" : (way ?? undefined)} style={from} className="flex flex-col gap-[18px] lg:gap-7">
      {children}
    </div>
  );
}

/**
 * One question's answers and the way on. Choosing marks an answer; Next goes
 * to the address it names, so every answer is a history entry and the
 * browser's back button walks back through the questions. The chosen state is
 * the only thing held here: the answers themselves live in the address.
 */
export function QuizStep({
  options,
  layout,
  initial,
  back,
  backLabel,
}: {
  options: Option[];
  /** `art`: the mood tiles. `grid`: four plain answers. `row`: three. */
  layout: "art" | "grid" | "row";
  /** The answer this question had, when coming back to it. */
  initial?: string;
  back: string;
  backLabel: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(options.some((o) => o.value === initial) ? initial : undefined);
  const picked = options.find((o) => o.value === chosen);
  // Whether an answer has been chosen by a press yet, rather than brought back.
  const [pressed, setPressed] = useState(false);
  const choose = (value: string) => {
    setPressed(true);
    setChosen(value);
  };

  const grid =
    layout === "row"
      ? "grid grid-cols-1 gap-2.5 lg:grid-cols-3 lg:gap-3.5"
      : "grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5";

  return (
    <>
      <div role="radiogroup" aria-label="Answers" className={grid}>
        {options.map((o) =>
          layout === "art" ? (
            <ArtTile key={o.value} option={o} on={o.value === chosen} pop={pressed} onChoose={() => choose(o.value)} />
          ) : (
            <PlainTile key={o.value} option={o} on={o.value === chosen} pop={pressed} tall={layout === "grid"} onChoose={() => choose(o.value)} />
          ),
        )}
      </div>
      <div className="flex items-center justify-between pt-1">
        <Link
          href={back}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => leave(e.currentTarget, "back")}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 transition-colors duration-(--fast) ease-out hover:text-ink"
        >
          <Icon name="chevL" size={16} />
          {backLabel}
        </Link>
        <button
          type="button"
          disabled={!picked}
          onClick={(e) => {
            if (!picked) return;
            leave(e.currentTarget, "next");
            const go = () => router.push(picked.href);
            if (still()) go();
            else setTimeout(go, EXIT.fast);
          }}
          className={buttonClass("primary", "md", "min-w-24")}
        >
          Next
        </button>
      </div>
    </>
  );
}

/** Chosen: an amber ring and the amber tick, the one state this screen has. */
const ON_RING = "shadow-[0_0_0_3px_var(--accent)]";

/** It pops in when an answer is chosen by a press; the answer a question came back with is simply there. */
function ChosenTick({ pop }: { pop: boolean }) {
  return (
    <span className={`${pop ? "motion-tick-in" : ""} absolute right-2 top-2 inline-flex size-[22px] items-center justify-center rounded-full bg-accent text-black`}>
      <Icon name="check" size={13} />
    </span>
  );
}

/**
 * A mood: its artwork cropped to the faces under a scrim, the name and a hint
 * over it. Without artwork it is the placeholder tile, the surface with the
 * words in ink, so a mood the cache has no poster for is still a tile to choose.
 */
function ArtTile({ option, on, pop, onChoose }: { option: Option; on: boolean; pop: boolean; onChoose: () => void }) {
  const art = Boolean(option.poster);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onChoose}
      className={`${PRESS} relative h-[120px] w-full overflow-hidden rounded-[14px] border-0 bg-surface-2 p-0 text-left lg:h-[140px] ${on ? ON_RING : "shadow-elevation"}`}
    >
      {art && (
        <>
          <Poster
            path={option.poster!}
            alt=""
            width={342}
            height={513}
            sizes="(min-width: 64rem) 220px, 50vw"
            className="absolute inset-0 size-full object-[center_25%]"
          />
          <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-black/5 to-black/78" />
        </>
      )}
      <span className={`absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5 ${art ? "text-white" : "text-ink"}`}>
        <span className="font-display text-base font-bold leading-[1.1] tracking-[-0.02em]">{option.label}</span>
        {option.hint && <span className={`text-[11px] ${art ? "text-white/75" : "text-ink-2"}`}>{option.hint}</span>}
      </span>
      {on && <ChosenTick pop={pop} />}
    </button>
  );
}

/** An answer with no artwork: a panel with the answer and its hint. */
function PlainTile({ option, on, pop, tall, onChoose }: { option: Option; on: boolean; pop: boolean; tall: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onChoose}
      className={`${PRESS} relative flex flex-col justify-end gap-1 rounded-[14px] border-0 bg-surface px-4 py-3.5 pr-10 text-left text-ink ${tall ? "min-h-[120px] lg:min-h-[140px]" : "min-h-[76px]"} ${on ? ON_RING : "shadow-elevation"}`}
    >
      <span className="font-display text-base font-bold leading-[1.1] tracking-[-0.02em] lg:text-lg">{option.label}</span>
      {option.hint && <span className="text-xs text-ink-2">{option.hint}</span>}
      {on && <ChosenTick pop={pop} />}
    </button>
  );
}
