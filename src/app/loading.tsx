import { Skeleton, SkeletonRail } from "@/components/ui";

/**
 * The fallback for the twenty-odd routes without a `loading.tsx` of their own —
 * login, settings, the watchlist, a person, an episode.
 *
 * So it is deliberately the shape those pages have in common and nothing more:
 * a heading, a line under it, and a block of content. It briefly described the
 * home page instead — an up-next card and a rail labelled "Loading up next" —
 * which was accurate for exactly one route and a promise the other twenty could
 * not keep. A skeleton shaped like a different page is the thing that makes the
 * real one appear to rearrange itself.
 *
 * Home would be better served by a skeleton of its own. That needs the page
 * moved into a route group so it can carry one without every descendant
 * inheriting it, which is a routing change rather than a styling one.
 */
export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full" />

      <Skeleton className="mt-6 h-32 w-full rounded-2xl" />
      <SkeletonRail />
    </div>
  );
}
