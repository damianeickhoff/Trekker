import Image from "next/image";
import { tmdbSrc } from "@/lib/tmdb-image-loader";
import { ZOOM } from "../motion";
import { TrekkerMark } from "../trekker-mark";
import { FeedImg } from "./feed-img";

/*
 * Where a news card's picture goes (Round 10 review), in one place for the
 * big and small cards, your news's cards, Home's rail and New trailers: the
 * feed's own picture, else the named title's backdrop or poster from the
 * cache, else a placeholder that is meant to be there. Each fills the
 * caller's frame (`relative overflow-hidden`, rounded), and the pictures zoom
 * with the card (`ZOOM`); the placeholder does not, since nothing is there.
 */

/**
 * No picture at all: the second surface with the mark faint in the middle and
 * the source's name small in the corner. Tokens only, so it reads in either
 * theme.
 */
export function NoPicture({ source, mark = 28, corner = "bottom" }: { source?: string | null; mark?: number; corner?: "top" | "bottom" }) {
  return (
    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-surface-2">
      <TrekkerMark height={mark} className="text-ink opacity-[0.12]" />
      {source && (
        <span className={`absolute ${corner === "top" ? "top-2.5" : "bottom-2"} left-2.5 max-w-[calc(100%-20px)] truncate font-mono text-[9px] font-semibold uppercase tracking-[0.05em] text-ink-3`}>
          {source}
        </span>
      )}
    </span>
  );
}

/**
 * The picture, by what there is. `backdropWidth` is the TMDB width asked for
 * by name (w300 for a small frame, w780 for a card), since the poster
 * loader's widths are made for posters.
 */
export function NewsPicture({
  imageUrl = null,
  backdrop = null,
  poster = null,
  source = null,
  backdropWidth = 780,
  sizes,
  mark,
  corner,
  eager = false,
  still = false,
}: {
  imageUrl?: string | null;
  backdrop?: string | null;
  poster?: string | null;
  source?: string | null;
  backdropWidth?: 300 | 780;
  /** The frame's width, for the poster's `sizes`. */
  sizes: string;
  mark?: number;
  /** Where the source's name goes: the top where words stand on the picture's foot (the trailer cards). */
  corner?: "top" | "bottom";
  /** The lead, which is the first thing on the page. */
  eager?: boolean;
  /** No hover zoom: the lead carousel's pictures have their slow zoom instead. */
  still?: boolean;
}) {
  const zoom = still ? "" : ZOOM;
  if (imageUrl) {
    // The placeholder beneath, so a picture that fails to load (and hides itself) leaves it showing, not a blank.
    return (
      <>
        <NoPicture source={source} mark={mark} corner={corner} />
        <FeedImg src={imageUrl} eager={eager} className={`absolute inset-0 size-full object-cover ${zoom}`} />
      </>
    );
  }
  if (backdrop) {
    return (
      <Image
        unoptimized
        src={`https://image.tmdb.org/t/p/w${backdropWidth}/${backdrop.replace(/^\//, "")}`}
        alt=""
        width={backdropWidth}
        height={Math.round((backdropWidth * 9) / 16)}
        className={`absolute inset-0 size-full object-cover ${zoom}`}
      />
    );
  }
  if (poster) {
    return (
      <Image
        src={tmdbSrc(poster)}
        alt=""
        width={342}
        height={513}
        sizes={sizes}
        className={`absolute inset-0 size-full object-cover object-[center_22%] ${zoom}`}
      />
    );
  }
  return <NoPicture source={source} mark={mark} corner={corner} />;
}
