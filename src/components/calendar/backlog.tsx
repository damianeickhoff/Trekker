import { episodeCode, titleHref } from "@/lib/marks";
import type { UpNextRow } from "@/lib/title-state";
import { Link } from "../link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { RailImage } from "../rail";
import { ArtChip } from "../ui";

/** Smaller than a rail poster, 120×180 and 108×162 on phones: the backlog is a reminder, not a shop window. Shared with the bones. */
export const BACKLOG_POSTER = "h-[162px] w-[108px] lg:h-[180px] lg:w-[120px]";

/**
 * One show in the calendar's backlog: a small poster with the episode to watch
 * next top-left, where the calendar's own posters carry their code, and how
 * many are waiting under it. No tick: the strip says what has piled up, and
 * ticking it off is Still to watch's job or the title page's.
 */
export function BacklogTile({ row, left }: { row: UpNextRow; left: number }) {
  return (
    <Link
      href={titleHref("tv", row.showId)}
      role="listitem"
      aria-label={`${row.showName}, ${episodeCode(row.seasonNumber, row.episodeNumber)}, ${left} left`}
      className={`${ZOOM_GROUP} flex shrink-0 flex-col gap-1.5`}
    >
      <span className={`block rounded-[10px] ${ZOOM_SHADOW}`}>
      <span className={`relative block overflow-hidden rounded-[10px] shadow-elevation ${BACKLOG_POSTER}`}>
        <RailImage
          path={row.showPoster}
          alt=""
          title={row.showName}
          width={112}
          height={168}
          sizes="(min-width: 64rem) 120px, 108px"
          className={`size-full ${ZOOM}`}
        />
        <span className="absolute left-1.5 top-1.5 flex">
          <ArtChip small>{episodeCode(row.seasonNumber, row.episodeNumber)}</ArtChip>
        </span>
      </span>
      </span>
      <span className="mono-label">{left} left</span>
    </Link>
  );
}
