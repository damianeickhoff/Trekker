import Image from "next/image";
import type { ReactNode } from "react";
import type { DiscoverType } from "@/lib/discover";
import { categoryHops, withType } from "@/lib/discover";
import { Icon } from "../icon";
import { Link } from "../link";
import { SEGMENT_CHIP_PILL, segmentChip } from "../motion";
import { SegmentPill } from "../segment-pill";
import { bandScrim } from "../title/hero";
import { filterChipClass } from "../ui";

/*
 * Pieces Discover shares with its category and genre pages.
 */

const TYPES: [DiscoverType, string][] = [
  ["all", "Everything"],
  ["tv", "Shows"],
  ["movie", "Films"],
];

/**
 * Everything, Shows, Films. Each is an address that replaces the entry, as
 * every filter chip does, so the back button leaves the page rather than
 * stepping back through filters. `disabled` names a medium the page has no
 * half for (a genre television does not have), shown but not offered.
 */
export function TypeChips({
  base,
  current,
  extra,
  disabled,
  className = "",
}: {
  base: string;
  current: DiscoverType;
  extra?: Record<string, string | number | undefined>;
  disabled?: DiscoverType;
  className?: string;
}) {
  return (
    // Vertical padding inside the row, so the chips' shadows are not clipped by it.
    <nav aria-label="Show" className={`relative -my-2 flex gap-1.5 py-2 ${className}`}>
      <SegmentPill className={SEGMENT_CHIP_PILL} />
      {TYPES.map(([type, label]) =>
        type === disabled ? (
          <span key={type} aria-disabled="true" className={`${filterChipClass(false)} opacity-45`}>
            {label}
          </span>
        ) : (
          <Link
            key={type}
            href={withType(base, type, extra)}
            replace
            scroll={false}
            aria-current={type === current ? "true" : undefined}
            data-segment=""
            data-on={type === current ? "" : undefined}
            className={segmentChip}
          >
            {label}
          </Link>
        ),
      )}
    </nav>
  );
}

/**
 * Previous and next, and where you are between them. Page one carries no
 * parameter. `hrefFor` is for a page whose address carries more than the
 * filter, such as the filter page's whole question.
 */
export function Pager({
  base = "",
  type = "all",
  page,
  totalPages,
  hrefFor,
}: {
  base?: string;
  type?: DiscoverType;
  page: number;
  totalPages: number;
  hrefFor?: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const href = hrefFor ?? ((p: number) => withType(base, type, { page: p > 1 ? p : undefined }));
  const button = "inline-flex h-10 items-center gap-1 rounded-full bg-surface px-4 text-[13px] font-semibold text-ink shadow-elevation";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className={button}>
          <Icon name="chevL" size={16} />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="mono-label">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} className={button}>
          Next
          <Icon name="chevR" size={16} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** A page with nothing to show, in the dashed empty-state style. */
export function EmptyNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-ink-3 px-6 py-7 text-center">
      <p className="m-0 font-display text-lg font-bold">{title}</p>
      <div className="m-0 max-w-[380px] text-[13px] leading-[1.45] text-ink-2">{children}</div>
    </div>
  );
}

/**
 * A band's box: out to the screen's edges on phones, where the page has a 20px
 * gutter, and on desktop the page column itself, with only the art reaching
 * past the cap. Isolated so the art can sit behind everything in it.
 */
export const BAND = "relative isolate -mx-5 flex flex-col gap-5 px-5 pb-[84px] pt-[72px] lg:mx-0 lg:gap-6 lg:px-0";

/**
 * The art behind a band: TMDB's w1280 backdrop as a soft wash behind the
 * posters, blurred and saturated as the heroes' blurred copy is (a light blur
 * read as a poor image rather than a wash), under the heroes' scrim with its
 * fade at both ends. It runs 12% past the box on every side, so the
 * blur's soft edges fall outside the band. Without a path, plain night.
 */
export function BandArt({ path }: { path: string | null }) {
  return (
    <span aria-hidden="true" className="band-ends pointer-events-none absolute inset-0 -z-(--z-lift) overflow-hidden bg-night lg:bleed">
      {path && (
        <Image
          unoptimized
          src={`https://image.tmdb.org/t/p/w1280/${path.replace(/^\//, "")}`}
          alt=""
          width={1280}
          height={720}
          className="absolute -left-[12%] -top-[12%] h-[124%] w-[124%] max-w-none object-cover object-[center_30%] opacity-85 blur-[40px] saturate-150"
        />
      )}
      <span className="absolute inset-0" style={{ background: bandScrim() }} />
    </span>
  );
}

/**
 * Every category one chip away, on Discover under the filter and on each
 * category's page under its title, so one can be swapped for another without
 * going back. The filter rides along and leaves out what it empties
 * (`categoryHops`). From Discover a chip is a way in, so it adds to history;
 * between categories it replaces the entry, as filter chips do, so the back
 * button leaves for Discover rather than walking every category seen.
 */
export function CategoryChips({ type, current, className = "" }: { type: DiscoverType; current?: string; className?: string }) {
  return (
    // Vertical padding inside the row, so the chips' shadows are not clipped by it.
    <nav aria-label="Categories" className={`no-scrollbar -mx-5 -my-2 flex gap-1.5 overflow-x-auto px-5 py-2 lg:mx-0 lg:px-0 ${className}`}>
      {categoryHops(type).map((hop) => {
        const on = current !== undefined && hop.covers.includes(current);
        return (
          <Link
            key={hop.id}
            href={hop.href}
            replace={current !== undefined}
            aria-current={on ? "page" : undefined}
            className={filterChipClass(on)}
          >
            {hop.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The grid pages' posters (a category, a genre, the filter page, Things you
 * may like): three across on phones, and from `lg` six across the content
 * column with the rails' gap, so they come out close to a rail poster's size
 * and grow with the column on a wide screen. `GRID_PAGE` is four rows of them.
 */
export const POSTER_GRID = "grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-6 lg:gap-x-(--rail-gap) lg:gap-y-5";

/** What a grid poster is drawn at: a sixth of the column, less its gaps, from `lg`. */
export const GRID_POSTER_SIZES = "(min-width: 117.5rem) calc((100vw - 740px) / 6), (min-width: 64rem) 200px, 33vw";
