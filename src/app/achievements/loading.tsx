import { Skeleton } from "@/components/ui";

/**
 * The achievements page opens with a card — the level, the bar, the tally —
 * and only then becomes a grid of badges. The skeleton used to start with bare
 * headings on the page background, so the card appeared to drop in on top of
 * something rather than being what was there all along.
 */
export default function Loading() {
  return (
    <div className="rise">
      <div className="card mt-3 p-5 sm:p-6">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        <Skeleton className="mt-5 h-2.5 w-full rounded-full" />
      </div>

      {[0, 1, 2].map((section) => (
        <div key={section} className="mt-8">
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="card flex items-center gap-3 p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="min-w-0 grow">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
