import { sortHref } from "@/lib/list-sorts";
import { Link } from "../link";
import { SEGMENT_CHIP_PILL, segmentChip } from "../motion";
import { SegmentPill } from "../segment-pill";

/**
 * A row of sort chips, each an address that replaces the entry, as Still to
 * watch does, so the back button leaves the page rather than stepping back
 * through orders. The chosen chip's fill is one pill that slides to the
 * chip pressed (`SegmentPill`), as Discover's Everything, Shows, Films does.
 */
export function SortChips<T extends string>({
  base,
  sorts,
  current,
  className = "",
}: {
  base: string;
  sorts: [T, string][];
  current: T;
  className?: string;
}) {
  return (
    // Vertical padding inside the scroller, so the chips' shadows are not clipped by it.
    <nav aria-label="Sort" className={`no-scrollbar relative -mx-5 -my-2 flex gap-1.5 overflow-x-auto px-5 py-2 lg:mx-0 lg:px-0 ${className}`}>
      <SegmentPill className={SEGMENT_CHIP_PILL} />
      {sorts.map(([s, label]) => (
        <Link
          key={s}
          href={sortHref(base, sorts, s)}
          replace
          scroll={false}
          aria-current={s === current ? "true" : undefined}
          data-segment=""
          data-on={s === current ? "" : undefined}
          className={segmentChip}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
