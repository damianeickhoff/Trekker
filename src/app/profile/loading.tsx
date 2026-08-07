import { Skeleton, SkeletonTiles } from "@/components/ui";

export default function Loading() {
  return (
    <div className="rise">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3.5 w-52" />
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
