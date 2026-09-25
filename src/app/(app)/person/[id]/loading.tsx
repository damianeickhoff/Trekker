import { Bone, HeroBone, SkeletonScreen } from "@/components/skeleton";

/** Three across on phones; from `lg` the desktop poster width, as the page lays them. */
function Tiles({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fill,var(--poster-desk))] lg:justify-between lg:gap-x-(--tile-gap) lg:gap-y-3.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Bone className="aspect-[2/3] w-full rounded-[10px]" />
          <Bone className="h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function NameBlock({ big }: { big: boolean }) {
  return (
    <div className={`flex flex-col ${big ? "gap-2.5" : "gap-2"}`}>
      <HeroBone className={big ? "h-12 w-96 rounded-lg" : "h-7 w-40 rounded-md"} />
      <HeroBone className={big ? "h-3.5 w-80 rounded" : "h-3 w-44 rounded"} />
      <HeroBone className={big ? "h-5 w-28 rounded-md" : "h-5 w-24 rounded-md"} />
      <HeroBone className={big ? "mt-1.5 h-11 w-[118px] rounded-full" : "mt-1 h-9 w-[100px] rounded-full"} />
    </div>
  );
}

/** A person: the top row, the portrait and name on the hero, how much of their work is seen, then the work. */
export default function PersonLoading() {
  return (
    <SkeletonScreen label="person">
      <div className="lg:hidden">
        <div className="flex flex-col bg-night">
          <div className="flex h-[71px] items-center justify-between px-5 pt-[27px]">
            <HeroBone className="size-10 rounded-full" />
            <HeroBone className="size-10 rounded-full" />
          </div>
          <div className="flex items-end gap-4 px-5 pb-6 pt-3">
            <HeroBone className="h-[160px] w-32 rounded-[14px]" />
            <NameBlock big={false} />
          </div>
        </div>
        <div className="flex flex-col gap-4 px-5 pt-1">
          <Bone className="h-[76px] rounded-[18px]" />
          <div className="flex gap-1.5">
            <Bone className="h-[34px] w-24 rounded-full" />
            <Bone className="h-[34px] w-16 rounded-full" />
            <Bone className="h-[34px] w-20 rounded-full" />
            <Bone className="h-[34px] w-32 rounded-full" />
          </div>
          <Tiles count={6} />
        </div>
      </div>
      <div className="hidden flex-col gap-7 lg:flex">
        <div className="relative isolate flex flex-col gap-6 px-10 pb-12 pt-7">
          <div className="absolute inset-0 -z-(--z-lift) bg-night lg:bleed" />
          <div className="flex items-center justify-between">
            <HeroBone className="h-4 w-14 rounded" />
            <HeroBone className="size-10 rounded-full" />
          </div>
          <div className="flex items-end gap-7">
            <HeroBone className="h-[275px] w-[220px] rounded-[20px]" />
            <NameBlock big />
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-10 px-10 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Tiles count={14} />
          <Bone className="h-[92px] rounded-[18px]" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
