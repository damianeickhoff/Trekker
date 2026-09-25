import { Bone, SkeletonScreen } from "@/components/skeleton";

/**
 * Cast: the back button on its own row, then "Cast" (with the count and the
 * filters beside it on desktop; the title's poster and the filters under it on
 * phones), then a grid of 4:5 tiles.
 */
export default function CastLoading() {
  return (
    <SkeletonScreen label="cast">
      <div className="flex flex-col gap-4 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <div className="flex flex-col gap-2 lg:gap-4">
          <div className="flex h-[71px] items-center pt-[27px] lg:h-auto lg:pt-0">
            <Bone className="size-10 rounded-full lg:hidden" />
            <Bone className="hidden h-4 w-24 rounded lg:block" />
          </div>
          <div className="flex items-center gap-4">
            <Bone className="h-[27px] w-24 rounded-md lg:h-[31px]" />
            <Bone className="hidden h-3 w-56 rounded lg:block" />
            <span className="grow" />
            <Bone className="hidden h-[34px] w-20 rounded-full lg:block" />
            <Bone className="hidden h-[34px] w-20 rounded-full lg:block" />
          </div>
        </div>
        <div className="flex items-center gap-3 lg:hidden">
          <Bone className="h-[60px] w-10 rounded-md" />
          <div className="flex flex-col gap-1.5">
            <Bone className="h-4 w-28 rounded" />
            <Bone className="h-3 w-40 rounded" />
          </div>
        </div>
        <div className="flex gap-1.5 lg:hidden">
          <Bone className="h-[34px] w-20 rounded-full" />
          <Bone className="h-[34px] w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-6 lg:gap-x-3.5 lg:gap-y-4 xl:grid-cols-8">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Bone className="aspect-[4/5] w-full rounded-[14px]" />
              <Bone className="h-3 w-4/5 rounded" />
              <Bone className="h-3 w-3/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
