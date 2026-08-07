import { Skeleton } from "@/components/ui";

/**
 * The search behind this page is several TMDB round trips plus the watchlist,
 * so it is one of the few in the app slow enough to be worth drawing. The shape
 * is the real one — hero, then two rows — so nothing jumps when it lands.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Working out what to watch">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-8 w-64" />

      <div className="mt-3 flex gap-2">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>

      <Skeleton className="mt-6 aspect-video w-full rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-4/5" />
      <Skeleton className="mt-2 h-3 w-2/5" />

      <div className="mt-4 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="card flex gap-3.5 p-3">
            {/* `self-start` for the same reason as the real card: without it
                the flex row stretches this to its own height and the
                placeholder is a different shape from the poster it stands in
                for, so the layout jumps when the artwork lands. */}
            <Skeleton className="aspect-2/3 w-[104px] shrink-0 self-start sm:w-[124px]" />
            <div className="min-w-0 flex-1">
              {/* The top line is as tall as the save button that lands in it,
                  so the rest of the card does not shift up when it arrives. */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-28 flex-1" />
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              </div>
              <Skeleton className="mt-1 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-24 rounded-full" />
              <Skeleton className="mt-2.5 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
