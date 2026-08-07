import { Skeleton, SkeletonRail } from "@/components/ui";

export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-2 h-4 w-72" />
      <Skeleton className="mt-5 h-56 w-full rounded-2xl sm:h-72" />
      <SkeletonRail />
      <SkeletonRail />
      <SkeletonRail />
    </div>
  );
}
