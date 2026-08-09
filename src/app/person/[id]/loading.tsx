import { Skeleton, SkeletonRail } from "@/components/ui";

/**
 * The person page's own shape while TMDB is asked about them.
 *
 * It exists for the route transition as much as for the wait. A navigation
 * only commits when the route has something to show, and without a loading
 * state that something is the finished page — so the cross-fade from a cast
 * rail held the old screen frozen for the whole fetch. With this here the
 * commit is immediate, and the portrait skeleton carries `person-art-name` in
 * the real photo's exact box, so a tapped face morphs straight onto it and
 * the photograph then fades in over the same spot.
 */
export default function Loading() {
  return (
    <div className="rise">
      {/* The back row's own height, so nothing below it moves when it arrives. */}
      <div className="h-[42px]" />

      <div className="flex flex-col gap-5 pt-2 sm:flex-row sm:gap-6">
        <Skeleton className="person-art-name mx-auto h-48 w-32 shrink-0 rounded-2xl sm:mx-0 sm:h-60 sm:w-40" />

        {/* Centred on a phone, beside the portrait on desktop — the same two
            arrangements the real header has. */}
        <div className="min-w-0 flex-1 max-sm:flex max-sm:flex-col max-sm:items-center">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />

          <Skeleton className="mt-5 h-4 w-full max-w-2xl" />
          <Skeleton className="mt-1.5 h-4 w-full max-w-2xl" />
          <Skeleton className="mt-1.5 h-4 w-2/3 max-w-2xl" />
        </div>
      </div>

      <SkeletonRail label="Loading shows" />
      <SkeletonRail label="Loading movies" />
    </div>
  );
}
