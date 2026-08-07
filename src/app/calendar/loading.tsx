import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />

      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>

      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card flex items-center gap-3 p-3">
            <Skeleton className="h-16 w-11 shrink-0 rounded-md" />
            <div className="min-w-0 grow">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-1.5 h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
