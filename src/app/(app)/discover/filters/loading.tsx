import { BackHeaderBones } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";
import { PosterGridBones } from "@/components/discover/listing-bones";

/** The way back and the title, the readback, the chips, the folded rows and sliders, then the grid. */
export default function FiltersLoading() {
  return (
    <SkeletonScreen label="filters">
      <div className="flex flex-col gap-5 px-5 pb-10 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        <div className="flex flex-col gap-3.5 lg:max-w-[560px]">
          <Bone className="h-5 w-4/5 rounded" />
          {[3, 3].map((count, row) => (
            <div key={row} className="flex gap-1.5">
              {Array.from({ length: count }, (_, i) => (
                <Bone key={i} className="h-[30px] w-24 rounded-full" />
              ))}
            </div>
          ))}
          {[0, 1].map((i) => (
            <Bone key={i} className="h-[45px] rounded-lg" />
          ))}
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 py-1">
              <Bone className="h-3 w-24 rounded" />
              <Bone className="h-1.5 w-full rounded" />
            </div>
          ))}
          {[0, 1].map((i) => (
            <Bone key={i} className="h-12 rounded-lg" />
          ))}
        </div>
        <div className="flex flex-col gap-3 pt-2 lg:gap-4">
          <Bone className="h-5 w-40 rounded-md" />
          <PosterGridBones />
        </div>
      </div>
    </SkeletonScreen>
  );
}
