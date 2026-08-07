import { Skeleton } from "@/components/ui";

/**
 * The achievements page is the slowest in the app on a cold cache — it resolves
 * up to eighty titles and twenty-five franchises against TMDB before it can draw
 * anything — so this is the one place a skeleton earns its keep most.
 */
export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-64" />
      <Skeleton className="mt-4 h-2.5 w-full rounded-full" />

      {Array.from({ length: 3 }, (_, section) => (
        <div key={section} className="mt-8">
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card flex items-center gap-3 p-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="min-w-0 grow">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1.5 h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
