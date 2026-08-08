import Image from "next/image";
import Link from "next/link";
import { img } from "@/lib/images";
import type { NormalisedItem } from "@/lib/tmdb";
import { RequestMark, ScoreBadge, StatusMark, type WatchStatus } from "./media-card";
import { Rail } from "./rail";

/**
 * Discover was seven identical poster rails stacked on top of each other, which
 * made everything below the spotlight read as one undifferentiated block. These
 * give the page a rhythm: a ranked row, a wide billboard row, and tinted bands
 * that group the rails which really are the same kind of thing.
 */

/** Ranked row. The numeral does the work; the poster stays the poster. */
export function NumberedRail({
  title,
  description,
  href,
  items,
  watchedIds,
  requests,
  startRank = 1,
}: {
  title: string;
  description?: string;
  href?: string;
  items: NormalisedItem[];
  watchedIds?: Map<string, WatchStatus>;
  requests?: Map<string, "pending" | "partial" | "available">;
  startRank?: number;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-4">
      <SectionHead title={title} description={description} href={href} />
      <Rail>
        {items.map((item, index) => (
          <RankedCard
            key={`${item.mediaType}-${item.id}`}
            item={item}
            rank={startRank + index}
            status={watchedIds?.get(`${item.mediaType}-${item.id}`)}
            request={requests?.get(`${item.mediaType}-${item.id}`)}
          />
        ))}
      </Rail>
    </section>
  );
}

/**
 * Built out of a two-row grid rather than wrapping a MediaCard: the numeral has
 * to sit in the poster's row so it aligns to the poster's bottom edge and can
 * never add height to the row. Anything overhanging turns the rail into a
 * vertical scroller as well as a horizontal one.
 */
function RankedCard({
  item,
  rank,
  status,
  request,
}: {
  item: NormalisedItem;
  rank: number;
  status?: WatchStatus;
  request?: "pending" | "partial" | "available";
}) {
  const src = img.poster(item.poster);
  // Two digits need a wider gutter and a smaller face, or the numeral runs
  // under the poster and collides with the title beneath it.
  const wide = rank >= 10;

  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      title={item.title}
      className={`rail-item group grid grid-rows-[auto_auto] gap-x-1.5 ${
        wide
          ? "w-[222px] grid-cols-[76px_1fr] sm:w-[250px]"
          : "w-[194px] grid-cols-[48px_1fr] sm:w-[222px]"
      }`}
    >
      <span
        aria-hidden
        className={`col-start-1 row-start-1 self-end text-center leading-[0.72] font-black text-ink-800 tabular-nums select-none ${
          wide ? "text-[54px] sm:text-[62px]" : "text-[62px] sm:text-[72px]"
        }`}
      >
        {rank}
      </span>

      <div className="relative col-start-2 row-start-1 aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
        {src && (
          <Image
            src={src}
            alt=""
            fill
            sizes="(max-width: 640px) 40vw, 160px"
            className="object-cover md:transition md:duration-500 md:group-hover:scale-105"
          />
        )}
        {status && <StatusMark status={status} />}
        {request && <RequestMark state={request} />}
        <div className="absolute inset-x-2 bottom-2">
          <ScoreBadge score={item.score} />
        </div>
      </div>

      <div className="col-start-2 row-start-2 min-w-0">
        <p className="mt-2 line-clamp-1 text-sm font-medium text-ink-100">{item.title}</p>
        <p className="text-xs text-ink-400">
          {item.mediaType === "tv" ? "Show" : "Movie"}
          {item.year ? ` · ${item.year}` : ""}
        </p>
      </div>
    </Link>
  );
}

/** Wide artwork row, for the handful of titles worth showing off. */
export function BillboardRail({
  title,
  description,
  href,
  items,
}: {
  title: string;
  description?: string;
  href?: string;
  items: NormalisedItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-4">
      <SectionHead title={title} description={description} href={href} />
      <Rail>
        {items.slice(0, 12).map((item) => {
          const art = img.backdrop(item.backdrop, "w780") ?? img.poster(item.poster, "w500");

          return (
            <Link
              key={`${item.mediaType}-${item.id}`}
              href={`/title/${item.mediaType}/${item.id}`}
              title={item.title}
              className="rail-item group w-[262px] sm:w-[320px]"
            >
              <div className="relative aspect-16/9 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
                {art && (
                  <Image
                    src={art}
                    alt=""
                    fill
                    sizes="320px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
                <div className="scrim-b absolute inset-0" />
                <div className="absolute inset-x-3 bottom-2.5">
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={item.score} />
                    <span className="text-[11px] text-white/70">
                      {item.mediaType === "tv" ? "Show" : "Movie"}
                      {item.year ? ` · ${item.year}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-semibold text-white drop-shadow">
                    {item.title}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </Rail>
    </section>
  );
}

/**
 * Tinted panel that groups related rails. Horizontal padding matches the page
 * gutter so the rails inside still bleed to the panel's own edge.
 */
export function SectionBand({
  title,
  description,
  tone = "cool",
  children,
}: {
  title: string;
  description: string;
  tone?: "cool" | "warm";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mt-10 rounded-3xl border border-ink-800/80 bg-gradient-to-br px-4 py-6 sm:px-6 ${
        tone === "warm"
          ? "from-ember-500/12 via-ink-900/40 to-transparent"
          : "from-flare-600/12 via-ink-900/40 to-transparent"
      }`}
    >
      <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      <p className="mt-1 text-sm text-ink-400">{description}</p>
      {children}
    </section>
  );
}

function SectionHead({
  title,
  description,
  href,
}: {
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-400">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="text-sm text-flare-400 hover:text-flare-500">
          See all
        </Link>
      )}
    </div>
  );
}
