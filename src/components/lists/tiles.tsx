import type { ListCard } from "@/lib/lists";
import type { Mark } from "@/lib/marks";
import { Icon } from "../icon";
import { Link } from "../link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { RailImage } from "../rail";

/*
 * The lists section's pieces, drawn from the mockups: a list as a tile with a
 * four-poster mosaic, and the dashed block every empty row shows. Posters are
 * the shared poster card (`poster-card.tsx`).
 */

export type PosterItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number | null;
  year?: string | null;
  mark: Mark;
};

/**
 * Four posters two by two, cropped to where the faces are. A list with fewer
 * shows the surface in the gaps rather than repeating itself. The four zoom
 * as one picture inside the rounded frame on a hover of the tile (`ZOOM`),
 * so the gaps between them keep their width.
 */
export function Mosaic({
  cells,
  cellClass,
  sizes,
  className = "",
}: {
  cells: { poster: string | null; title: string }[];
  cellClass: string;
  sizes: string;
  className?: string;
}) {
  const four = Array.from({ length: 4 }, (_, i) => cells[i] ?? null);
  return (
    <span aria-hidden="true" className={`block overflow-hidden rounded-[14px] ${className}`}>
    <span className={`grid grid-cols-2 gap-[3px] ${ZOOM}`}>
      {four.map((cell, i) =>
        cell?.poster ? (
          <RailImage
            key={i}
            path={cell.poster}
            alt=""
            width={92}
            height={138}
            sizes={sizes}
            className={`w-full object-[center_25%] ${cellClass}`}
          />
        ) : (
          <span key={i} className={`block w-full bg-surface-2 ${cellClass}`} />
        ),
      )}
    </span>
    </span>
  );
}

/** A list on the overview: the mosaic, its name, and how many titles. Smart lists carry the sparkle. */
export function ListTile({ card, className, cellClass, sizes }: { card: ListCard; className: string; cellClass: string; sizes: string }) {
  const smart = card.kind === "smart";
  return (
    <Link href={`/lists/${card.id}`} role="listitem" className={`${ZOOM_GROUP} flex shrink-0 flex-col gap-2.5 ${className}`}>
      {/* On a hover the mosaic zooms in its frame and the tile's shadow deepens; the name stays. */}
      <span className={`block rounded-[14px] ${ZOOM_SHADOW}`}>
        <Mosaic cells={card.mosaic} cellClass={cellClass} sizes={sizes} className="shadow-elevation" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          {smart && <Icon name="sparkle" size={14} className="text-accent-text" />}
          <span className="truncate">{card.name}</span>
        </span>
        <span className="mono-label text-[10px]">
          {card.count} {card.count === 1 ? "title" : "titles"}
          {smart ? " · rebuilt daily" : ""}
        </span>
      </span>
    </Link>
  );
}

/** An empty row: the app's one empty state, under the name the lists pages already use. */
export { EmptyState as EmptyBlock } from "../empty-state";
