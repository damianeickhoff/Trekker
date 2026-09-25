import { Bone, HeroBone, SkeletonScreen } from "@/components/skeleton";

/** Tonight's pick on its dark hero, then the row of three below it. */
export default function ResultsLoading() {
  return (
    <SkeletonScreen label="tonight's pick">
      <div className="relative flex min-h-[470px] flex-col bg-night lg:hidden">
        <div className="flex h-[71px] items-center justify-between px-5 pt-[27px]">
          <HeroBone className="size-10 rounded-full" />
          <HeroBone className="size-10 rounded-full" />
        </div>
        <div className="flex grow flex-col justify-end gap-2.5 px-5 pb-[18px] pt-3">
          <div className="flex items-end gap-4">
            <HeroBone className="h-[195px] w-[130px] rounded-xl" />
            <div className="flex grow flex-col gap-2">
              <HeroBone className="h-5 w-28 rounded-md" />
              <HeroBone className="h-10 w-4/5 rounded-lg" />
              <HeroBone className="h-3 w-3/4 rounded" />
            </div>
          </div>
          <HeroBone className="h-3 w-full rounded" />
          <HeroBone className="h-3 w-4/5 rounded" />
          <div className="flex gap-2">
            <HeroBone className="h-11 w-36 rounded-full" />
            <HeroBone className="h-11 w-24 rounded-full" />
            <HeroBone className="size-11 rounded-full" />
          </div>
        </div>
      </div>
      <div className="relative isolate hidden flex-col gap-8 px-10 pb-16 pt-9 lg:flex">
        <div className="absolute inset-0 -z-(--z-lift) bg-night lg:bleed" />
        <div className="flex items-center justify-between">
          <HeroBone className="h-4 w-32 rounded" />
          <HeroBone className="h-4 w-64 rounded" />
          <HeroBone className="size-10 rounded-full" />
        </div>
        <div className="flex items-end gap-8">
          <HeroBone className="h-[360px] w-[240px] rounded-2xl" />
          <div className="flex w-[520px] flex-col gap-3.5 pb-2">
            <HeroBone className="h-6 w-32 rounded-md" />
            <HeroBone className="h-16 w-4/5 rounded-lg" />
            <HeroBone className="h-3.5 w-3/4 rounded" />
            <HeroBone className="h-3.5 w-full rounded" />
            <div className="flex gap-2.5">
              <HeroBone className="h-[46px] w-52 rounded-full" />
              <HeroBone className="h-[46px] w-24 rounded-full" />
              <HeroBone className="h-[46px] w-36 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-5 pt-2 lg:px-10 lg:pt-0">
        <div className="flex items-baseline gap-3">
          <Bone className="h-5 w-44 rounded-md" />
          <Bone className="h-3 w-40 rounded" />
        </div>
        <div className="flex gap-3 overflow-hidden lg:gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex w-[250px] shrink-0 flex-col gap-2.5 lg:w-[360px]">
              <Bone className="h-[150px] rounded-[14px] lg:h-[216px]" />
              <Bone className="h-3 w-3/5 rounded" />
              <Bone className="h-3 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
