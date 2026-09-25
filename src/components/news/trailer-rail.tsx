import type { TrailerCard } from "@/lib/news-page";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { Rail, RailBackdrop, RailImage } from "../rail";
import { SectionHead } from "../section-head";
import { NewsPicture } from "./no-picture";
import { PlayMark } from "./press-cards";

/**
 * New trailers (Round 10), at the page's foot at both widths: 268×151 cards
 * on desktop, 220×124 in a phone's swipe rail, the picture under a scrim with
 * the play mark, the title and "Series · 2026". A card opens the trailer on
 * YouTube in a new tab, as the title page's Trailer does, or the article for
 * a headline. Absent when the fortnight has none.
 */
export function TrailerRail({ cards }: { cards: TrailerCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="news-trailers" className="flex flex-col gap-3">
      <SectionHead id="news-trailers" title="New trailers" meta="last two weeks" href="/news?tab=trailers" />
      <Rail label="New trailers">
        {cards.map((c) => (
          <a
            key={c.id}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
            aria-label={`Trailer: ${c.title}`}
            className={`${ZOOM_GROUP} ${ZOOM_SHADOW} block shrink-0 rounded-[14px]`}
          >
            <span className="relative block h-[124px] w-[220px] overflow-hidden rounded-[inherit] bg-surface-2 lg:h-[151px] lg:w-[268px]">
              {c.imageUrl || !(c.backdrop || c.poster) ? (
                // The feed's own picture, or nothing: `NoPicture` names the source small, so the headline is not typed twice.
                <NewsPicture imageUrl={c.imageUrl} source={c.source ?? c.title} sizes="268px" mark={32} corner="top" />
              ) : c.backdrop ? (
                <RailBackdrop path={c.backdrop} className={`size-full ${ZOOM}`} />
              ) : (
                <RailImage path={c.poster} alt="" title={c.title} width={268} height={402} sizes="268px" className={`size-full object-[center_22%] ${ZOOM}`} />
              )}
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,0.75)_100%)]" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[60%]">
                <PlayMark size={40} />
              </span>
              <span className="absolute inset-x-3 bottom-2.5 flex flex-col gap-[3px] text-white">
                <span className="truncate text-sm font-bold">{c.title}</span>
                <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-white/70">{c.line}</span>
              </span>
            </span>
          </a>
        ))}
      </Rail>
    </section>
  );
}
