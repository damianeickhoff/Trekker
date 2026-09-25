import type { ReactNode } from "react";
import { titleHref, type Mark } from "@/lib/marks";
import { StatusMark, TickMark } from "./artwork";
import { Link } from "./link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "./motion";
import { RailBackdrop, RailImage } from "./rail";
import { ArtChip } from "./ui";

/*
 * The poster system (STYLE.md, "Posters"): the standard poster card and the
 * wide card, at the old app's sizes (`--poster-card`, `--wide-card` in
 * `globals.css`). Every poster rail on Home, Discover and Lists draws one of
 * these, so a poster says the same things in the same places wherever it is:
 * a short fact (On this day's year, when it was watched) top-left, the score
 * top-right, where the watched tick replaces it, the Plex or requested mark
 * bottom-right, and under it the title and what it is.
 */

export type PosterCardItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  score?: number | null;
  year?: string | number | null;
};

/** What a rail poster asks TMDB for: the card's own width at each size. */
export const POSTER_CARD_SIZES = "(min-width: 64rem) 182px, 150px";

/** "Show · 2026", "Film · 2026", or the kind alone when the year is not known. */
export function kindYear(item: { mediaType: "movie" | "tv"; year?: string | number | null }) {
  return [item.mediaType === "tv" ? "Show" : "Film", item.year].filter(Boolean).join(" · ");
}

/**
 * The poster's own furniture, shared by the card and anything else that draws
 * a standard poster (Discover's chart). The score and the tick share the
 * top-right corner because they answer one question, whether this is worth
 * watching: once it is watched the tick says more than the crowd's score.
 */
export function PosterFurniture({
  score,
  mark,
  seen = false,
  chip,
}: {
  score?: number | null;
  mark?: Mark;
  seen?: boolean;
  chip?: string;
}) {
  return (
    <>
      {chip && (
        <span className="absolute left-1.5 top-1.5 flex">
          <ArtChip small>{chip}</ArtChip>
        </span>
      )}
      {seen ? (
        <span role="img" aria-label="Watched" className="absolute right-1.5 top-1.5 flex">
          <TickMark on onArt size={22} />
        </span>
      ) : score ? (
        <span className="absolute right-1.5 top-1.5 flex">
          <ArtChip small>{score}%</ArtChip>
        </span>
      ) : null}
      {mark && (
        <span className="absolute bottom-1.5 right-1.5 flex">
          <StatusMark mark={mark} />
        </span>
      )}
    </>
  );
}

/** Title and what it is, under a poster: one line each, cut with an ellipsis. */
export function PosterCaption({ title, meta }: { title: string; meta: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 pt-2">
      <span className="truncate text-[13px] font-semibold leading-[1.3]">{title}</span>
      <span className="truncate text-xs leading-[1.3] text-ink-3">{meta}</span>
    </span>
  );
}

/**
 * The standard poster card: 182×274 on desktop, 150×226 on phones. In a grid
 * (`fill`) it takes the cell's width at the same shape instead. A title with
 * no artwork is the placeholder tile, with its title typed at the foot.
 */
export function PosterCard({
  item,
  mark = null,
  seen = false,
  chip,
  meta,
  fill = false,
  sizes = POSTER_CARD_SIZES,
  corner,
}: {
  item: PosterCardItem;
  mark?: Mark;
  seen?: boolean;
  chip?: string;
  /** In place of "Show · 2026", where the rail knows something better (Recently watched's episode). */
  meta?: string;
  fill?: boolean;
  sizes?: string;
  /** Bottom-left on the art, the one corner the furniture leaves free: your own bucket, where a page shows it. */
  corner?: ReactNode;
}) {
  return (
    <Link
      href={titleHref(item.mediaType, item.tmdbId)}
      role="listitem"
      aria-label={item.title}
      className={`${ZOOM_GROUP} flex min-w-0 shrink-0 flex-col ${fill ? "w-full" : "w-(--poster-card)"}`}
    >
      {/* The poster zooms inside its frame on a hover (`ZOOM`); the caption under it stays. */}
      <span className={`block rounded-[10px] ${ZOOM_SHADOW}`}>
        <span
          className={`relative block overflow-hidden rounded-[10px] shadow-elevation ${
            fill ? "aspect-[182/274] w-full" : "h-(--poster-card-h) w-(--poster-card)"
          }`}
        >
          <RailImage path={item.poster} alt="" title={item.title} width={182} height={274} sizes={sizes} className={`size-full ${ZOOM}`} />
          <PosterFurniture score={item.score} mark={mark} seen={seen} chip={chip} />
          {corner && <span className="absolute bottom-1.5 left-1.5 flex">{corner}</span>}
        </span>
      </span>
      <PosterCaption title={item.title} meta={meta ?? kindYear(item)} />
    </Link>
  );
}

/**
 * The wide card: 318×178 on desktop, 260×145 on phones, for what is happening
 * rather than what could be watched (Landing soon, Friends watched, In
 * cinemas). The title's w780 backdrop; its poster cropped to the faces when
 * TMDB has no backdrop; the plain surface when it has neither, since the card
 * types its title anyway. Chips top-left, the score top-right, the title and
 * a line at the foot over a scrim, the mark bottom-right.
 */
export function WideCard({
  href,
  label,
  backdrop,
  poster,
  title,
  line,
  chips,
  score,
  foot,
  mark = null,
}: {
  href: string;
  label: string;
  backdrop: string | null;
  poster: string | null;
  title: string;
  line?: ReactNode;
  chips?: ReactNode;
  score?: number | null;
  /** Above the title at the foot: In cinemas' "Film · 2026". */
  foot?: ReactNode;
  mark?: Mark;
}) {
  return (
    <Link
      href={href}
      role="listitem"
      aria-label={label}
      className={`${ZOOM_GROUP} block h-(--wide-card-h) w-(--wide-card) shrink-0 rounded-xl ${ZOOM_SHADOW}`}
    >
      <span className="relative block size-full overflow-hidden rounded-xl bg-surface-2 shadow-elevation">
        {/* Only the picture zooms; the chips, the scrim and the words at the foot stay. */}
        {backdrop ? (
          <RailBackdrop path={backdrop} className={`size-full ${ZOOM}`} />
        ) : poster ? (
          <RailImage path={poster} alt="" width={342} height={513} sizes="(min-width: 64rem) 318px, 260px" className={`size-full object-[center_22%] ${ZOOM}`} />
        ) : null}
        <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-black/0 from-35% to-black/80" />
        {chips && (
          <span className={`absolute left-2.5 top-2.5 flex flex-wrap gap-1.5 ${score ? "right-14" : "right-2.5"}`}>{chips}</span>
        )}
        {score ? (
          <span className="absolute right-2.5 top-2.5 flex">
            <ArtChip small>{score}%</ArtChip>
          </span>
        ) : null}
        <span className={`absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5 text-white ${mark ? "pr-7" : ""}`}>
          {foot}
          <span className="truncate font-display text-base font-bold leading-[1.15] tracking-[-0.02em]">{title}</span>
          {line && <span className="truncate text-xs text-white/78">{line}</span>}
        </span>
        {mark && (
          <span className="absolute bottom-2 right-2 flex">
            <StatusMark mark={mark} />
          </span>
        )}
      </span>
    </Link>
  );
}
