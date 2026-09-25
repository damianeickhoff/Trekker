import { Bone, HeroBone, SkeletonScreen } from "@/components/skeleton";
import { PeopleRailBones } from "@/components/title/bones";

/** An episode: the still on the hero, its name and buttons, the rating panel, then the cast. */
export default function EpisodeLoading() {
  return (
    <SkeletonScreen label="episode">
      <div className="lg:hidden">
        <div className="flex h-[296px] flex-col bg-night">
          <div className="flex h-[60px] items-center justify-between px-5 pt-4">
            <HeroBone className="size-10 rounded-full" />
            <div className="flex gap-2">
              <HeroBone className="size-10 rounded-full" />
              <HeroBone className="size-10 rounded-full" />
            </div>
          </div>
          <div className="flex grow items-end px-5">
            <HeroBone className="h-[196px] w-full rounded-t-[14px]" />
          </div>
        </div>
        <div className="flex flex-col gap-3.5 px-5 pt-3.5">
          <Bone className="h-4 w-40 rounded" />
          <Bone className="h-8 w-56 rounded-md" />
          <Bone className="h-3 w-48 rounded" />
          <div className="flex gap-2">
            <Bone className="h-[46px] grow rounded-full" />
            <Bone className="h-[46px] grow rounded-full" />
          </div>
          <Bone className="h-[92px] rounded-[18px]" />
        </div>
      </div>
      <div className="relative hidden flex-col gap-7 px-10 pt-8 lg:flex">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-night lg:bleed" />
        <div className="relative flex justify-between">
          <HeroBone className="h-4 w-40 rounded" />
          <HeroBone className="size-10 rounded-full" />
        </div>
        <div className="relative grid grid-cols-2 gap-9 xl:grid-cols-[640px_minmax(0,1fr)]">
          <HeroBone className="aspect-video rounded-2xl" />
          <div className="flex flex-col gap-3">
            <HeroBone className="h-5 w-48 rounded" />
            <HeroBone className="h-12 w-80 rounded-lg" />
            <HeroBone className="h-3.5 w-72 rounded" />
            <div className="flex gap-2.5">
              <HeroBone className="h-[46px] w-40 rounded-full" />
              <HeroBone className="h-[46px] w-36 rounded-full" />
            </div>
            <Bone className="mt-auto h-[100px] rounded-[18px]" />
          </div>
        </div>
      </div>
      <div className="px-5 pt-4 lg:px-10 lg:pt-7">
        <PeopleRailBones />
      </div>
    </SkeletonScreen>
  );
}
