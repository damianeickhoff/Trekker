import { SkeletonRail, SkeletonTiles } from "@/components/ui";

/**
 * The fallback for any route without one of its own. Deliberately generic —
 * a header, some tiles, a couple of rails — because it stands in for pages of
 * several different shapes and a wrong-shaped skeleton is worse than a vague
 * one: it promises a layout that never arrives.
 */
export default function Loading() {
  return (
    <div className="rise">
      <SkeletonTiles />
      <SkeletonRail />
      <SkeletonRail />
    </div>
  );
}
