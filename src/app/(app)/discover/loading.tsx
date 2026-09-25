import { BillboardBones, EyebrowBones, GenreBones, PosterRailBones, TrendingBones } from "@/components/discover/bones";
import { CategoryChipBones } from "@/components/discover/listing-bones";
import { MobileTop } from "@/components/page";
import { Bone, HeroBone, SkeletonScreen } from "@/components/skeleton";

/**
 * Phones open on the top three as a swiped set of large cards on a hero, which
 * is dark in both themes; desktop opens on the spotlight, #1 large and #2 and
 * #3 stacked beside it. The row of categories stands under the filter. The
 * rest of the top 20 and the genre row follow, then the billboard row, the
 * four rails and the two groups. The pieces after the top are the page's
 * own Suspense fallbacks, so each lands where its bones were.
 */
export default function DiscoverLoading() {
  return (
    <SkeletonScreen label="Discover">
      <div className="relative flex flex-col bg-night pb-6 lg:hidden">
        <MobileTop title="Discover" onHero right={<HeroButtonsBones />} />
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex gap-3 overflow-hidden px-5">
            <HeroBone className="h-[282px] w-[calc(100vw-56px)] max-w-[480px] rounded-2xl" />
            <HeroBone className="h-[282px] w-[calc(100vw-56px)] max-w-[480px] rounded-2xl" />
          </div>
          <div className="flex justify-center gap-1.5">
            <HeroBone className="h-1.5 w-5 rounded-full" />
            <HeroBone className="size-1.5 rounded-full" />
            <HeroBone className="size-1.5 rounded-full" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6 px-5 pt-1.5 lg:gap-7 lg:px-10 lg:pt-7">
        <div className="flex gap-2 lg:hidden">
          <Bone className="h-10 flex-1 rounded-full" />
          <Bone className="h-10 flex-1 rounded-full" />
        </div>
        <Bone className="hidden h-8 w-36 rounded-lg lg:-mb-3 lg:block" />
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <Bone key={i} className="h-[34px] w-24 rounded-full" />
            ))}
          </div>
          <span className="grow" />
          <Bone className="hidden h-10 w-[134px] rounded-full lg:block" />
          <Bone className="hidden h-10 w-[108px] rounded-full lg:block" />
        </div>
        <CategoryChipBones />
        <div className="hidden grid-cols-[1.7fr_1fr] gap-3 lg:grid">
          <Bone className="h-[362px] rounded-2xl" />
          <div className="grid grid-rows-2 gap-3">
            <Bone className="rounded-2xl" />
            <Bone className="rounded-2xl" />
          </div>
        </div>
        <TrendingBones />
        <GenreBones />
        <BillboardBones />
        <PosterRailBones />
        <PosterRailBones />
        <EyebrowBones />
      </div>
    </SkeletonScreen>
  );
}

function HeroButtonsBones() {
  return (
    <>
      <HeroBone className="size-10 rounded-full" />
      <HeroBone className="size-10 rounded-full" />
      <HeroBone className="size-10 rounded-full" />
    </>
  );
}
