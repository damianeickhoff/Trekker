import type { ReactNode } from "react";
import { titleHref } from "@/lib/marks";
import type { TitleArt } from "@/lib/news-page";
import { tagLabel } from "@/lib/news-words";
import type { PressRow } from "@/lib/press";
import { Icon } from "../icon";
import { Link } from "../link";
import { ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { Poster } from "../poster";
import { NewsPicture } from "./no-picture";
import { QuietChip, StateChip } from "../ui";

/*
 * Headlines on the News page (Round 10): the big card (picture on top) and
 * the small card, and the named title the lead carousel shares
 * (`lead-carousel.tsx`).
 * Each keeps Round 9's terms: the picture and the headline go out to the
 * article in a new tab, with no referrer; the line under a headline is the
 * feed's own summary line; nothing of the article is shown. A headline that
 * names a title the cache knows carries it as a link into Trekker, with how
 * the viewer stands with it ("watching", "saved"). Headlines have no read
 * state: they are not counted anywhere.
 */

export type Relation = "watching" | "saved" | null;

const out = (link: string) => ({ href: link, target: "_blank", rel: "noopener noreferrer" }) as const;

/** The play mark over a trailer's picture: white, as it is on every card that plays something. */
export function PlayMark({ size = 44 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex items-center justify-center rounded-full bg-white/92 text-black shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
    >
      <Icon name="play" size={Math.round(size * 0.4)} />
    </span>
  );
}

/** The matched title under a headline: its small poster, its name, and how the viewer stands with it. */
export function TitleLink({ row, relation, lead = false }: { row: PressRow; relation: Relation; lead?: boolean }) {
  if (!row.match) return null;
  const how = relation === "watching" ? (lead ? "you’re watching" : "watching") : relation === "saved" ? "saved" : null;
  return (
    <Link
      href={titleHref(row.match.mediaType, row.match.tmdbId)}
      className={`relative z-(--z-lift) inline-flex min-w-0 max-w-full items-center gap-2 text-xs font-semibold ${
        lead ? "text-white hover:text-white/80" : "text-ink-2 hover:text-ink"
      }`}
    >
      <Poster
        path={row.match.poster}
        alt=""
        title={row.match.title}
        width={22}
        height={33}
        sizes="22px"
        className={`${lead ? "h-[30px] w-5 rounded-[3px]" : "h-[33px] w-[22px] rounded"} text-[5px]`}
      />
      <span className="truncate">
        {row.match.title}
        {how && <span className={`font-medium ${lead ? "text-white/78" : "text-ink-3"}`}> · {how}</span>}
      </span>
    </Link>
  );
}

/** A small card's frame: the surface, 16px corners, 12px in. */
export const SMALL_CARD = "flex min-w-0 items-start gap-3 rounded-2xl bg-surface p-3 shadow-elevation";

/** The byline beside a small card's chip: "Variety · 2 h". */
export function Byline({ children }: { children: ReactNode }) {
  return <span className="min-w-0 truncate font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-ink-3">{children}</span>;
}

/**
 * The big card, for a headline with a picture and a summary line: the
 * picture on top at 16:9 with the kind chip on it (and the play mark on a
 * trailer), the headline in the display face, two lines of summary, and the
 * byline beside the matched title.
 */
export function BigPressCard({ row, relation, age, art }: { row: PressRow; relation: Relation; age: string; art?: TitleArt }) {
  return (
    <article className={`${ZOOM_GROUP} flex min-w-0 flex-col overflow-hidden rounded-[18px] bg-surface shadow-elevation`}>
      <a {...out(row.link)} tabIndex={-1} aria-hidden="true" className="relative block aspect-video overflow-hidden bg-surface-2">
        <NewsPicture imageUrl={row.imageUrl} backdrop={art?.backdrop} poster={art?.poster ?? row.match?.poster} source={row.source} sizes="400px" mark={44} />
        {row.tag && (
          <span className="absolute left-3 top-3">
            <StateChip small>{tagLabel(row.tag)}</StateChip>
          </span>
        )}
        {row.tag === "trailer" && (
          <span className="absolute left-1/2 top-1/2 -translate-1/2">
            <PlayMark />
          </span>
        )}
      </a>
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
        <a {...out(row.link)} className="font-display text-[19px] font-bold leading-[1.15] tracking-[-0.02em] text-ink hover:underline">
          {row.headline}
        </a>
        {row.summary && <span className="line-clamp-2 text-[13px] leading-[1.45] text-ink-2">{row.summary}</span>}
        <div className="flex min-w-0 items-center justify-between gap-2 pt-0.5">
          <Byline>
            {row.source} · {age}
          </Byline>
          <TitleLink row={row} relation={relation} />
        </div>
      </div>
    </article>
  );
}

/**
 * The small card: a 96×64 picture (the feed's, else the named title's from
 * the cache, else `NoPicture` with the source's name), the kind chip (quiet: a headline's kind is a fact about
 * it, not your state), the byline, and the headline in two lines.
 */
export function SmallPressCard({ row, age, art }: { row: PressRow; age: string; art?: TitleArt }) {
  return (
    <article className={`${ZOOM_GROUP} ${SMALL_CARD}`}>
      <a {...out(row.link)} tabIndex={-1} aria-hidden="true" className={`${ZOOM_SHADOW} block shrink-0 rounded-[10px]`}>
        <span className="relative block h-16 w-24 overflow-hidden rounded-[inherit] bg-surface-2">
          <NewsPicture
            imageUrl={row.imageUrl}
            backdrop={art?.backdrop}
            poster={art?.poster ?? row.match?.poster}
            source={row.source}
            backdropWidth={300}
            sizes="96px"
            mark={20}
          />
        </span>
      </a>
      <span className="flex min-w-0 grow flex-col gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5">
          {row.tag && <QuietChip>{tagLabel(row.tag)}</QuietChip>}
          <Byline>
            {row.source} · {age}
          </Byline>
        </span>
        <a {...out(row.link)} className="line-clamp-2 text-sm font-semibold leading-[1.3] text-ink hover:underline">
          {row.headline}
        </a>
      </span>
    </article>
  );
}

