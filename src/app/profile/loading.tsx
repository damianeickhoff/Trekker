import { Skeleton, SkeletonTiles } from "@/components/ui";

/**
 * The profile's header is a card with the avatar and name inside it, not a bare
 * row above the page. Standing them on the background meant the card arrived
 * afterwards and everything shifted down to make room for it.
 */
export default function Loading() {
  return (
    <div className="rise">
      <div className="card p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-3.5 w-52 max-w-full" />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SkeletonTiles />
      </div>

      <Skeleton className="mt-8 h-40 w-full rounded-2xl" />
      <Skeleton className="mt-8 h-32 w-full rounded-2xl" />
    </div>
  );
}
