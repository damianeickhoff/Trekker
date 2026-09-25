import type { ReactNode } from "react";
import { titleHref, type Mark } from "@/lib/marks";
import { Icon } from "./icon";
import { Link } from "./link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "./motion";
import { RailImage } from "./rail";
import { ArtChip, StateChip } from "./ui";

/*
 * Artwork tiles from the mockups: the portrait poster with its Overseerr mark,
 * and the landscape "wide" tile that crops a poster to its top third, where
 * the faces are. Every tile links to its title without prefetching.
 */

/**
 * 22px on dark glass. No blur: these sit on rails, which scroll, and blur is
 * kept for heroes and the tab bar.
 */
export function StatusMark({ mark }: { mark: Mark }) {
  if (!mark) return null;
  const plex = mark === "plex";
  return (
    <span
      role="img"
      aria-label={plex ? "On Plex" : "Requested"}
      title={plex ? "On Plex" : "Requested"}
      className={`inline-flex size-[22px] items-center justify-center rounded-full bg-black/60 ${plex ? "text-white" : "text-accent"}`}
    >
      <Icon name={plex ? "play" : "clock"} size={plex ? 11 : 12} />
    </span>
  );
}

/**
 * Filled when watched, an outline when not. Display only. `onArt` is the
 * white version for sitting on a poster, which is the same in both themes.
 */
export function TickMark({
  on,
  size = 22,
  onArt = false,
  className = "",
}: {
  on: boolean;
  size?: number;
  onArt?: boolean;
  className?: string;
}) {
  return on ? (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${onArt ? "bg-white text-black" : "bg-ink text-bg"} ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon name="check" size={Math.round(size * 0.6)} />
    </span>
  ) : (
    <span
      className={`inline-block shrink-0 rounded-full border-[1.5px] border-ink-3 opacity-70 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

type TileTitle = { mediaType: "movie" | "tv"; tmdbId: number; title: string; poster: string | null };

/** A portrait poster, with the mark bottom-left. Rails never draw one narrower than 84px, where it would not read. */
export function PosterTile({
  item,
  mark = null,
  chip,
  className,
  sizes,
}: {
  item: TileTitle;
  mark?: Mark;
  /** A short fact top-right, as a score sits: On this day's year. */
  chip?: string;
  /** Width and height for each breakpoint. */
  className: string;
  sizes: string;
}) {
  return (
    <Link
      href={titleHref(item.mediaType, item.tmdbId)}
      role="listitem"
      aria-label={item.title}
      className={`${ZOOM_GROUP} block shrink-0 rounded-[10px] ${ZOOM_SHADOW} ${className}`}
    >
      <span className="relative block size-full overflow-hidden rounded-[inherit] shadow-elevation">
      <RailImage path={item.poster} alt="" title={item.title} width={112} height={168} sizes={sizes} className={`size-full ${ZOOM}`} />
      {chip && (
        <span className="absolute right-1.5 top-1.5 flex">
          <ArtChip small>{chip}</ArtChip>
        </span>
      )}
      {mark && (
        <span className="absolute bottom-1.5 left-1.5 flex">
          <StatusMark mark={mark} />
        </span>
      )}
      </span>
    </Link>
  );
}

/**
 * Landscape use of a portrait poster, with an amber "when" and the title over a
 * scrim. Titles get two lines and may break anywhere, balanced, rather than an
 * ellipsis: "Stuart Fails to Save the Universe" cut to "Stuart Fails to…" says
 * nothing. The scrim starts high enough that a second line still sits on dark.
 */
export function WideTile({
  item,
  when,
  code,
  mark = null,
  className,
  sizes,
}: {
  item: TileTitle;
  when: string;
  code: ReactNode;
  mark?: Mark;
  className: string;
  sizes: string;
}) {
  return (
    <Link
      href={titleHref(item.mediaType, item.tmdbId)}
      role="listitem"
      className={`${ZOOM_GROUP} block shrink-0 rounded-xl ${ZOOM_SHADOW} ${className}`}
    >
      <span className="relative block size-full overflow-hidden rounded-[inherit] shadow-elevation">
      {/* No `title` for the placeholder: this tile types the title over its foot already. */}
      <RailImage
        path={item.poster}
        alt=""
        width={268}
        height={402}
        sizes={sizes}
        className={`size-full object-[center_22%] ${ZOOM}`}
      />
      <span aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-black/0 from-25% to-black/80" />
      <span className="absolute left-2.5 top-2.5 flex">
        <StateChip small>{when}</StateChip>
      </span>
      <span className="absolute inset-x-3 bottom-2.5 flex flex-col gap-0.5 pr-7 text-white">
        <span className="line-clamp-2 font-display text-base font-bold leading-[1.1] tracking-[-0.02em] text-balance wrap-anywhere">
          {item.title}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-white/75">{code}</span>
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
