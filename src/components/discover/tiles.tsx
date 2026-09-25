import type { ReactNode } from "react";
import type { DiscoverType } from "@/lib/discover";
import { clipWords } from "@/lib/spotlight";
import { titleHref, type Mark } from "@/lib/marks";
import type { ListItem } from "@/lib/tmdb";
import { StatusMark } from "../artwork";
import { Link } from "../link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { Poster } from "../poster";
import { kindYear, PosterCaption, PosterFurniture } from "../poster-card";
import { RailBackdrop, RailImage } from "../rail";
import { ArtChip } from "../ui";

/** What a tile needs of a title: a list row, or a pick. */
export type TileItem = Pick<ListItem, "id" | "mediaType" | "title" | "poster" | "score" | "year">;

/*
 * Discover's tiles: the genre tile, the ranked poster with its number beside
 * it, the spotlight's cards, and the plain poster the category and genre grids
 * use. Rails of posters and the wide billboard are the shared poster system
 * (`poster-card.tsx`); these are what Discover has that nothing else does.
 * Every poster carries what a poster carries everywhere: the score
 * bottom-left, the Plex or requested mark bottom-right, the watched tick
 * top-right.
 */

/**
 * A genre: 184×86 at every width, in one scrolling row, as the old app drew
 * them. The chosen title's backdrop, or its poster cropped to the faces, washed
 * in the genre's own tint towards the foot, the name bottom-left. On a hover
 * the artwork zooms (`ZOOM`) and the wash lifts from 0.9 to 0.75, so more of
 * the picture shows; the name stays where it is.
 */
export function GenreTile({
  slug,
  label,
  tint,
  poster,
  backdrop,
  type,
}: {
  slug: string;
  label: string;
  tint: string;
  poster: string | null;
  backdrop: string | null;
  type: DiscoverType;
}) {
  // Carried through, so a genre opened from the Shows view lands on shows.
  const href = `/discover/genre/${slug}${type === "all" ? "" : `?type=${type}`}`;
  return (
    <Link href={href} role="listitem" className={`${ZOOM_GROUP} block h-[86px] w-[184px] shrink-0 rounded-xl ${ZOOM_SHADOW}`}>
      <span className="relative block size-full overflow-hidden rounded-xl shadow-elevation" style={{ background: tint }}>
        {backdrop ? (
          <RailBackdrop path={backdrop} className={`size-full ${ZOOM}`} />
        ) : poster ? (
          <RailImage path={poster} alt="" width={342} height={513} sizes="184px" className={`size-full object-[center_20%] ${ZOOM}`} />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute inset-0 opacity-90 transition-opacity duration-(--base) ease-out group-hover/zoom:opacity-75"
          style={{ background: `linear-gradient(180deg, ${tint}00 30%, ${tint} 100%)` }}
        />
        <span className="absolute bottom-2 left-2.5 right-2 font-display text-[15px] font-bold leading-none tracking-[-0.02em] text-white">
          {label}
        </span>
      </span>
    </Link>
  );
}

/**
 * A place in the rest of the top 20, numbered as the old app numbers it: a big
 * solid figure in the faintest fill, centred in a gutter of its own left of
 * the poster and sitting on the poster's foot, so the number does the work and
 * the poster stays the poster. The poster is its own size (`--chart-card`,
 * 166×250 and 138×208 on phones) with the standard furniture and caption. Two
 * digits take a wider gutter and a smaller face, or they would run under the
 * poster. With the rail's 9px, a single-digit place starts 63px after the
 * poster before it.
 */
export function RankedTile({ item, rank, mark, seen, className = "" }: { item: TileItem; rank: number; mark: Mark; seen: boolean; className?: string }) {
  const wide = rank >= 10;
  return (
    <Link
      href={titleHref(item.mediaType, item.id)}
      role="listitem"
      aria-label={`${rank}. ${item.title}`}
      className={`${ZOOM_GROUP} grid shrink-0 grid-rows-[auto_auto] gap-x-1.5 ${className} ${wide ? "grid-cols-[76px_var(--chart-card)]" : "grid-cols-[48px_var(--chart-card)]"}`}
    >
      <span
        aria-hidden="true"
        className={`col-start-1 row-start-1 select-none self-end text-center font-display font-extrabold leading-[0.72] tabular-nums text-surface-2 ${
          wide ? "text-[54px] lg:text-[62px]" : "text-[62px] lg:text-[72px]"
        }`}
      >
        {rank}
      </span>
      {/* The poster zooms; the number beside it stays put. */}
      <span className={`col-start-2 row-start-1 block rounded-[10px] ${ZOOM_SHADOW}`}>
        <span className="relative block h-(--chart-card-h) w-(--chart-card) overflow-hidden rounded-[10px] shadow-elevation">
          <RailImage
            path={item.poster}
            alt=""
            title={item.title}
            width={166}
            height={250}
            sizes="(min-width: 64rem) 166px, 138px"
            className={`size-full ${ZOOM}`}
          />
          <PosterFurniture score={item.score} mark={mark} seen={seen} />
        </span>
      </span>
      <span className="col-start-2 row-start-2 min-w-0">
        <PosterCaption title={item.title} meta={kindYear(item)} />
      </span>
    </Link>
  );
}

/** The wide tile: a poster cropped to its top third, the title over a scrim, what else it needs on top. */
function Wide({
  item,
  mark,
  className,
  sizes,
  top,
  topRight = false,
  children,
  radius = "rounded-xl",
  priority = false,
  listItem = true,
}: {
  item: TileItem;
  mark: Mark;
  className: string;
  sizes: string;
  top?: ReactNode;
  topRight?: boolean;
  children: ReactNode;
  radius?: string;
  priority?: boolean;
  // False inside a card that is the list item itself.
  listItem?: boolean;
}) {
  const image = { path: item.poster, alt: "", width: 342, height: 513, sizes, className: `size-full object-[center_22%] ${ZOOM}` };
  return (
    <Link
      href={titleHref(item.mediaType, item.id)}
      role={listItem ? "listitem" : undefined}
      aria-label={item.title}
      className={`${ZOOM_GROUP} block shrink-0 ${ZOOM_SHADOW} ${radius} ${className}`}
    >
      <span className="relative block size-full overflow-hidden rounded-[inherit] bg-surface-2 shadow-elevation">
      {priority ? <Poster {...image} priority /> : <RailImage {...image} />}
      <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-black/0 from-40% to-black/72" />
      {top && <span className={`absolute top-2.5 flex gap-1.5 ${topRight ? "right-2" : "left-2.5"}`}>{top}</span>}
      <span className="absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5 pr-7 text-white">{children}</span>
      {mark && (
        <span className="absolute bottom-2 right-2 flex">
          <StatusMark mark={mark} />
        </span>
      )}
      </span>
    </Link>
  );
}

/**
 * #4 and #5 of the top five (Round 9), stacked beside the carousel on
 * desktop; a phone has no room beside it and starts the rest of the top 20
 * at #4 instead. The backdrop, or the poster cropped to the faces, under
 * a scrim that darkens towards the foot where the words are; the place
 * top-left and the score top-right, as on every poster, the mark
 * bottom-right, and "Film · 2026" over the title. The synopsis is the
 * trending answer's own, which is already a cached row, cut to whole words
 * (`clipWords`) and clamped to three lines. Each fills its row of the
 * desktop's 480px pair (236px each with the gap). The artwork keeps the hover
 * zoom: nothing else moves it.
 */
export function SpotlightCard({
  item,
  rank,
  mark,
}: {
  item: TileItem & { backdrop: string | null; overview: string };
  rank: number;
  mark: Mark;
}) {
  const art = item.backdrop ?? item.poster;
  const overview = clipWords(item.overview, 200);
  return (
    <Link
      href={titleHref(item.mediaType, item.id)}
      role="listitem"
      aria-label={`#${rank} this week: ${item.title}`}
      className={`${ZOOM_GROUP} relative flex min-w-0 overflow-hidden rounded-2xl bg-night shadow-elevation h-full`}
    >
      {/* The backdrop zooms inside the card, which clips it; the words stay. */}
      {art && (
        <Poster
          path={art}
          alt=""
          width={item.backdrop ? 1280 : 342}
          height={item.backdrop ? 720 : 513}
          sizes="(min-width: 117.5rem) 36vw, 440px"
          priority
          className={`absolute inset-0 size-full ${ZOOM} ${item.backdrop ? "" : "object-[center_22%]"}`}
        />
      )}
      <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-black/0 from-15% to-black/85" />
      <span className="absolute left-3 top-3 flex">
        <ArtChip small>#{rank} this week</ArtChip>
      </span>
      {item.score > 0 && (
        <span className="absolute right-3 top-3 flex">
          <ArtChip small>{item.score}%</ArtChip>
        </span>
      )}
      <span className={`relative mt-auto flex w-full min-w-0 flex-col gap-1 p-4 text-white ${mark ? "pr-11" : ""}`}>
        <span className="text-[11px] text-white/78">{kindYear(item)}</span>
        <span className={`line-clamp-1 font-display font-extrabold text-lg leading-none tracking-[-0.03em]`}>{item.title}</span>
        {overview && (
          <span className={`max-w-[560px] text-[13px] leading-[1.4] text-white/78 line-clamp-3`}>{overview}</span>
        )}
      </span>
      {mark && (
        <span className="absolute bottom-3 right-3 flex">
          <StatusMark mark={mark} />
        </span>
      )}
    </Link>
  );
}

/** A pick below Tonight's: wide, what it is top-left, then two quiet lines under the art. */
export function PickCard({
  item,
  label,
  mark,
  meta,
  why,
  className,
  art,
  sizes,
}: {
  item: TileItem;
  label: string;
  mark: Mark;
  meta: string;
  why: string;
  className: string;
  art: string;
  sizes: string;
}) {
  return (
    <div role="listitem" className={`flex shrink-0 flex-col gap-2.5 ${className}`}>
      <Wide item={item} mark={mark} listItem={false} className={art} radius="rounded-[14px]" sizes={sizes} top={<ArtChip small>{label}</ArtChip>}>
        <span className="line-clamp-2 font-display text-xl font-extrabold leading-none tracking-[-0.03em] text-balance">{item.title}</span>
      </Wide>
      <span className="flex flex-col gap-[3px]">
        <span className="text-xs text-ink-3">{meta}</span>
        <span className="text-[13px] leading-[1.4] text-ink-2">{why}</span>
      </span>
    </div>
  );
}

/** A poster in a category or genre grid, with the standard furniture. */
export function GridTile({
  item,
  mark,
  seen,
  sizes = "(min-width: 64rem) 93px, 33vw",
}: {
  item: TileItem;
  mark: Mark;
  seen: boolean;
  sizes?: string;
}) {
  return (
    <Link
      href={titleHref(item.mediaType, item.id)}
      role="listitem"
      aria-label={item.title}
      className={`${ZOOM_GROUP} block aspect-[2/3] w-full rounded-[10px] ${ZOOM_SHADOW}`}
    >
      <span className="relative block size-full overflow-hidden rounded-[10px] shadow-elevation">
        <Poster path={item.poster} alt="" title={item.title} width={154} height={231} sizes={sizes} className={`size-full ${ZOOM}`} />
        <PosterFurniture score={item.score} mark={mark} seen={seen} />
      </span>
    </Link>
  );
}
