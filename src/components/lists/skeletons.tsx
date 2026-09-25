import { BackHeaderBones } from "../page";
import { Bone, HeroBone, SkeletonScreen } from "../skeleton";
import { GRID } from "./title-grid";

/*
 * The lists section's skeletons, box for box with the pages they stand in for.
 */

function GridBones({ count = 12 }: { count?: number }) {
  return (
    <div className={GRID}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Bone className="aspect-[182/274] w-full rounded-[10px]" />
          <Bone className="mt-0.5 h-3.5 w-3/4 rounded" />
          <Bone className="h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

function ChipBones() {
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <Bone key={i} className="h-[34px] w-24 rounded-full" />
      ))}
    </div>
  );
}

/** The watchlist and favourites in full. */
export function FullListBones({ label }: { label: string }) {
  return (
    <SkeletonScreen label={label}>
      <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        <ChipBones />
        <GridBones />
      </div>
    </SkeletonScreen>
  );
}

/** One list: the banner, then chips and posters. */
export function ListBones() {
  return (
    <SkeletonScreen label="list">
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-[250px] bg-night lg:bleed lg:h-[320px]" />
        <div className="relative flex flex-col">
          <div className="flex h-[71px] items-center justify-between px-5 pt-[27px] lg:hidden">
            <HeroBone className="size-10 rounded-full" />
            <HeroBone className="size-10 rounded-full" />
          </div>
          <div className="flex min-h-[190px] flex-col justify-end gap-2 px-5 pb-4 lg:hidden">
            <HeroBone className="h-8 w-3/4 rounded-md" />
            <HeroBone className="h-3.5 w-1/2 rounded" />
            <div className="flex gap-2">
              <HeroBone className="h-10 w-40 rounded-full" />
              <HeroBone className="h-10 w-16 rounded-full" />
            </div>
          </div>
          <div className="hidden flex-col gap-[26px] px-10 pt-9 lg:flex">
            <HeroBone className="h-4 w-14 rounded" />
            <div className="flex items-end gap-6">
              <HeroBone className="h-[159px] w-40 rounded-[14px]" />
              <div className="flex grow flex-col gap-2">
                <HeroBone className="h-3 w-20 rounded" />
                <HeroBone className="h-12 w-96 rounded-md" />
                <HeroBone className="h-4 w-72 rounded" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3.5 px-5 pt-3 lg:gap-4 lg:px-10 lg:pt-5">
            <ChipBones />
            <GridBones />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}

/** The smart list editor: the preview strip on phones, the two columns on a desktop. */
export function EditorBones() {
  const rows = (
    <>
      <Bone className="h-[46px] w-full rounded-xl" />
      <Bone className="h-12 w-full rounded-md" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Bone key={i} className="h-5 w-full rounded" />
      ))}
    </>
  );
  return (
    <SkeletonScreen label="smart list">
      <div className="flex flex-col gap-3 px-5 lg:hidden">
        {/* BackHeader with no meta line, as the editor has it. */}
        <div className="flex flex-col gap-2 pb-2">
          <div className="flex h-[71px] items-center pt-[27px]">
            <Bone className="size-10 rounded-full" />
          </div>
          <Bone className="h-[27px] w-48 rounded-md" />
        </div>
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <Bone key={i} className="h-[108px] w-[72px] rounded-lg" />
          ))}
        </div>
        {rows}
      </div>
      <div className="hidden grid-cols-[460px_minmax(0,1fr)] gap-x-10 gap-y-4 px-10 pt-7 lg:grid">
        <Bone className="col-span-2 h-4 w-20 rounded" />
        <div className="flex flex-col gap-3.5">
          <Bone className="h-[31px] w-64 rounded-md" />
          {rows}
        </div>
        <div className="flex flex-col gap-3.5 pt-[5px]">
          <Bone className="h-6 w-40 rounded-md" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
            {Array.from({ length: 12 }, (_, i) => (
              <Bone key={i} className="aspect-[2/3] w-full rounded-[10px]" />
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
