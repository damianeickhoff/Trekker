import Image from "next/image";
import { airedWhen } from "@/lib/dates";
import type { CardExtras } from "@/lib/home";
import { episodeCode } from "@/lib/marks";
import type { UpNextRow } from "@/lib/title-state";
import { ExitList } from "../exit-list";
import { Icon } from "../icon";
import { Link } from "../link";
import { PRESS, ROW_WASH } from "../motion";
import { Poster } from "../poster";

import { Swap } from "../swap";
import { buttonClass } from "../ui";
import { CardMoreMenu } from "./more-menu";

import { TickFlash, TickScope } from "./tick-flash";
import { TickButton, WatchedButton } from "./watched-button";
import { WaitingFold } from "./waiting-fold";

/*
 * The Up next card and Also waiting. The card is lit by its own artwork: the
 * poster, blurred and saturated behind a scrim that follows the theme, so it
 * reads as the show's colour in dark and as tinted paper in light. Text on it
 * is the theme's ink either way.
 */

function left(row: UpNextRow) {
  const n = Math.max(row.airedCount - row.watchedCount, 1);
  return n === 1 ? "1 left" : `${n} left`;
}

const label = (row: UpNextRow) => `${episodeCode(row.seasonNumber, row.episodeNumber)} of ${row.showName}`;

/**
 * Every chip on the card shares one box: 24px tall at every width, a 1px
 * border (transparent on the amber one) and a fixed line height, so the
 * state chip and the facts beside it sit on the same line and the same
 * baseline. The shared `StateChip` is 20px when small and borderless, which
 * is what put the two out of step.
 */
const CHIP_BOX =
  "h-6 items-center whitespace-nowrap rounded-md border px-[9px] font-mono text-[11px] leading-[14px] uppercase tracking-[0.05em]";

/** Amber is state: the card's Up next. */
function UpNextChip() {
  return <span className={`${CHIP_BOX} inline-flex border-transparent bg-accent font-semibold text-black`}>Up next</span>;
}

/** Facts on the card: outlined, with a fill so they read over any artwork. */
function CardChip({ children, className = "inline-flex" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`${CHIP_BOX} font-medium text-ink-soft dark:border-white/28 dark:bg-black/38 light:border-black/28 light:bg-white/35 ${className}`}
    >
      {children}
    </span>
  );
}

/** Secondary buttons on the card: hero glass in dark, a plain surface in light; either lifts its fill under a pointer. */
const glass =
  `${PRESS} shrink-0 items-center justify-center gap-2 rounded-full border-0 text-sm font-semibold dark:bg-white/16 dark:text-white dark:backdrop-blur-[10px] dark:hover:bg-white/26 light:bg-surface light:text-ink light:shadow-elevation light:hover:bg-surface-2`;

/**
 * Mark watched, the card's main button. It presses, and under a pointer its
 * fill brightens: a halo of its own colour grows round it (a shadow, which
 * repaints and never lays out), and in light the ink lifts a step.
 */
const WATCHED =
  "transition-[scale,background-color,box-shadow] duration-(--fast) ease-out motion-safe:not-disabled:active:scale-[0.97] hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_22%,transparent)] light:hover:bg-[#2c2e38]";

/**
 * The artwork behind the card: TMDB's smallest poster, blurred. One small
 * download on top of the poster itself, never a second full-size image.
 */
function CardBackdrop({ path }: { path: string | null }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {path && (
        <Image
          unoptimized
          src={`https://image.tmdb.org/t/p/w92/${path.replace(/^\//, "")}`}
          alt=""
          fill
          className="scale-[1.24] object-cover object-[center_30%] opacity-(--stub-art-opacity) blur-[44px] saturate-150"
        />
      )}
      <span className="absolute inset-0 [background:var(--stub-overlay)]" />
    </span>
  );
}

export function UpNextCard({
  row,
  extras,
  waiting,
  networks,
  today,
}: {
  row: UpNextRow;
  extras: CardExtras;
  /** Also waiting, for the panel the card carries on wide screens. */
  waiting: UpNextRow[];
  networks: Record<number, string>;
  today: string;
}) {
  const href = `/title/tv/${row.showId}`;
  const code = episodeCode(row.seasonNumber, row.episodeNumber);
  const name = row.episodeName ?? `Episode ${row.episodeNumber}`;
  const audience = extras.audience !== null ? `${extras.audience}%` : null;
  const friends = extras.friends !== null ? `${extras.friends.toFixed(1)} friends` : null;
  const scoreShort = [audience, friends].filter(Boolean).join(" · ");
  const scoreLong = [audience && `${audience} audience`, friends].filter(Boolean).join(" · ");

  return (
    <section
      aria-label="Up next"
      className="relative z-(--z-card) order-2 flex items-center gap-4 rounded-[22px] bg-surface-2 p-4 text-ink lg:items-stretch lg:gap-[26px] lg:p-6"
    >
      <TickScope>
        <CardBackdrop path={row.showPoster} />

        <Link
          href={href}
          className="relative z-(--z-lift) shrink-0 self-center overflow-hidden rounded-[10px] shadow-[0_12px_32px_rgba(0,0,0,0.45)] lg:rounded-[14px]"
        >
          {/* One image, sized by CSS per breakpoint, so a phone never downloads the desktop one. */}
          {/* A new show crossfades in under the tick, which plays on over both (`Swap`). */}
          <Swap id={String(row.showId)} mode="crossfade">
            <Poster
              path={row.showPoster}
              alt={row.showName}
              title={row.showName}
              width={150}
              height={225}
              sizes="(min-width: 64rem) 225px, 100px"
              className="h-[150px] w-[100px] lg:h-[350px] lg:w-[225px]"
              priority
            />
          </Swap>
          <TickFlash size={52} />
        </Link>

        {/* After Mark watched the words give way to the next episode's: out, then in with a small rise. */}
        <Swap
          id={`${row.showId}-${row.seasonNumber}-${row.episodeNumber}`}
          className="relative z-(--z-lift) flex min-w-0 grow flex-col justify-center gap-2.5 lg:gap-3.5"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <UpNextChip />
            {scoreShort && <CardChip className="inline-flex lg:hidden">{scoreShort}</CardChip>}
            {scoreLong && <CardChip className="hidden lg:inline-flex">{scoreLong}</CardChip>}
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="hidden truncate font-mono text-[15px] font-semibold tracking-[0.06em] text-accent-text lg:block">
              {code} · {name}
            </span>
            <Link href={href} className="min-w-0">
              <h2 className="m-0 line-clamp-2 font-display text-[26px] font-extrabold leading-[0.98] tracking-[-0.035em] lg:line-clamp-1 lg:text-[44px]">
                {row.showName}
              </h2>
            </Link>
            <span className="line-clamp-2 text-[13px] text-ink-soft lg:hidden">
              <span className="font-mono font-semibold tracking-[0.05em] text-accent-text">{code}</span> · {name}
              {row.runtime ? ` · ${row.runtime} min` : ""}
            </span>
          </div>

          <div className="hidden flex-wrap items-center gap-2 lg:flex">
            {row.runtime ? <CardChip>{row.runtime} min</CardChip> : null}
            {extras.network && <CardChip>{extras.network}</CardChip>}
            <CardChip>
              {row.watchedCount} of {row.totalCount || row.airedCount} watched
            </CardChip>
            {row.airDate && <CardChip>{airedWhen(row.airDate, today)}</CardChip>}
          </div>

          {/* What the episode is about fills the width a wide card would
              otherwise leave empty; capped so a line stays readable at 1920px. */}
          {extras.overview && (
            <p className="m-0 hidden max-w-[560px] text-[15px] leading-[1.45] text-ink-2 lg:line-clamp-2">
              {extras.overview}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <WatchedButton
              key={`${row.showId}-${row.seasonNumber}-${row.episodeNumber}`}
              showId={row.showId}
              seasonNumber={row.seasonNumber}
              episodeNumber={row.episodeNumber}
              label={label(row)}
              className={`${WATCHED} inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 bg-primary px-[18px] text-sm font-semibold text-on-primary disabled:opacity-60 lg:h-[46px]`}
            />
            {extras.plexUrl && (
              <>
                <a
                  href={extras.plexUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Play on Plex"
                  className={`${glass} inline-flex size-10 lg:hidden`}
                >
                  <Icon name="play" size={18} />
                </a>
                <a
                  href={extras.plexUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${glass} hidden h-[46px] px-[18px] lg:inline-flex`}
                >
                  <Icon name="play" size={18} />
                  Play on Plex
                </a>
              </>
            )}
            <CardMoreMenu showId={row.showId} showName={row.showName} className={`${glass} inline-flex size-10 lg:size-[46px]`} />
          </div>
        </Swap>
      </TickScope>

      {waiting.length > 0 && (
        <div className="relative z-(--z-lift) hidden w-[420px] shrink-0 flex-col gap-3 rounded-2xl px-3.5 py-4 xl:flex dark:bg-black/28 light:bg-white/50">
          <div className="flex items-baseline justify-between px-1">
            <span className="font-display text-base font-bold tracking-[-0.02em]">Also waiting</span>
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-ink-soft">
              {waiting.length} {waiting.length === 1 ? "show" : "shows"}
            </span>
          </div>
          <ExitList label="Also waiting" className={WAITING_LIST}>
            {waiting.slice(0, CARD_ROWS).map((w) => (
              <WaitingRow key={w.showId} row={w} network={networks[w.showId] ?? null} />
            ))}
          </ExitList>
          {waiting.length > CARD_ROWS && (
            <Link href="/waiting" className={buttonClass("ghost", "sm", "w-full")}>
              Show all {waiting.length}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** Rows Also waiting shows as a list of its own; the rest are on `/waiting`. */
export const WAITING_ROWS = 6;

/**
 * Rows the card's panel shows. Three keep the panel no taller than the card
 * it sits in; "Show all N" under them is the way to the rest.
 */
const CARD_ROWS = 3;

/** Its rows leave by collapsing (`ExitList`), which spaces them itself. */
const WAITING_LIST = "flex flex-col";

/**
 * One show with an episode waiting. On phones a surface like a calendar agenda
 * row; from `lg` a plain row with no surface, which is quieter inside the card
 * and in a two-column list. Poster on the left, tick on the right either way.
 * The line under the title says how many are left on phones and the network
 * from `lg`, where there is room to care which service it is on.
 */
export function WaitingRow({ row, network }: { row: UpNextRow; network: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[14px] bg-surface py-2.5 pl-2.5 pr-3 shadow-elevation lg:rounded-none lg:bg-transparent lg:px-0 lg:py-1 lg:shadow-none">
      <TickScope>
        <Link href={`/title/tv/${row.showId}`} className={`flex min-w-0 grow items-center gap-3 ${ROW_WASH}`}>
          <span className="relative flex shrink-0 overflow-hidden rounded-[7px]">
            <Poster path={row.showPoster} alt="" title={row.showName} width={44} height={66} sizes="44px" className="h-[66px] w-11" />
            <TickFlash size={26} />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[11px] font-semibold tracking-[0.05em] text-accent-text">
              {episodeCode(row.seasonNumber, row.episodeNumber)}
            </span>
            <span className="truncate text-sm font-semibold">{row.showName}</span>
            <span className="truncate text-xs text-ink-2">
              {row.episodeName ?? `Episode ${row.episodeNumber}`}
              <span className="lg:hidden"> · {left(row)}</span>
              {network && <span className="max-lg:hidden"> · {network}</span>}
            </span>
          </span>
        </Link>
        <TickButton
          key={`${row.showId}-${row.seasonNumber}-${row.episodeNumber}`}
          showId={row.showId}
          seasonNumber={row.seasonNumber}
          episodeNumber={row.episodeNumber}
          label={label(row)}
          size={28}
        />
      </TickScope>
    </div>
  );
}

/**
 * The other shows with an aired episode waiting, warmest first. On phones and
 * mid-width screens a list of its own; from `xl` the card carries it instead.
 * The first six, and the section head's chevron to `/waiting` for the rest,
 * as Recently watched goes to history; from `lg` a "Show all N" under the
 * list says the same in words.
 */
export function AlsoWaitingList({ rows, networks }: { rows: UpNextRow[]; networks: Record<number, string> }) {
  if (rows.length === 0) return null;
  // On phones it folds under its head (`WaitingFold`), and "Show all N" is the way to the rest there too.
  return (
    <WaitingFold meta={`${rows.length} ${rows.length === 1 ? "show" : "shows"}`}>
      <ExitList label="Also waiting" className={`${WAITING_LIST} lg:grid lg:grid-cols-2 lg:gap-x-3 lg:gap-y-2`} gap="pb-2 lg:pb-0">
        {rows.slice(0, WAITING_ROWS).map((row) => (
          <WaitingRow key={row.showId} row={row} network={networks[row.showId] ?? null} />
        ))}
      </ExitList>
      {rows.length > WAITING_ROWS && (
        <Link href="/waiting" className={buttonClass("ghost", "sm", "self-start")}>
          Show all {rows.length}
        </Link>
      )}
    </WaitingFold>
  );
}
