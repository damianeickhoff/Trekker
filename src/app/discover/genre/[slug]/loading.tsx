import { Skeleton, SkeletonGrid } from "@/components/ui";

export default function Loading() {
  return (
    <div className="rise">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 mb-6 h-4 w-72" />
      <SkeletonGrid count={20} />
    </div>
  );
}
