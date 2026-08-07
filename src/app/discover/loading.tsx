import { Skeleton, SkeletonRail } from "@/components/ui";

/**
 * Discover's own shape: a heading, a line under it, then rails all the way
 * down.
 *
 * It used to promise a full-width card between the heading and the first rail.
 * There is no such card on this page — the only one lives most of a screen
 * further down — so the skeleton was describing a layout that never arrived,
 * and the page appeared to rearrange itself as it loaded.
 */
export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-72 max-w-full" />

      {/* `SkeletonRail` draws its own heading, so these stand in for a section
          each rather than needing one written above them. */}
      <SkeletonRail label="Loading picks" />
      <SkeletonRail />
      <SkeletonRail />
      <SkeletonRail />
    </div>
  );
}
