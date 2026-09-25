import { BackHeaderBones } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** The way back and the title, then the grid of rated posters. */
export default function RatingsLoading() {
  return (
    <SkeletonScreen label="Ratings and reviews">
      <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-x-2.5 gap-y-5 lg:grid-cols-[repeat(auto-fill,minmax(126px,1fr))] lg:gap-x-3">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bone className="aspect-[2/3] w-full rounded-[10px]" />
              <Bone className="h-3.5 w-3/4 rounded" />
              <Bone className="h-2.5 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
