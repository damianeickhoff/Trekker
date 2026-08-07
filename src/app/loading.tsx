import { Skeleton, SkeletonRail } from "@/components/ui";

/**
 * The home page's shape, which is also the fallback for any route without one
 * of its own.
 *
 * It used to be a grid of tiles and two rails — a shape no page in the app
 * actually has. A skeleton is a promise about what is arriving, and a wrong one
 * is worse than a vague one: the page visibly rearranges itself the moment the
 * real content lands. This is the greeting, the line under it, the card that
 * carries what you are part-way through, and the rails below.
 */
export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full" />

      <Skeleton className="mt-5 h-44 w-full rounded-2xl sm:h-56" />

      <SkeletonRail label="Loading up next" />
      <SkeletonRail />
    </div>
  );
}
