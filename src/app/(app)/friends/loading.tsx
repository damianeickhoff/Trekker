import { ActivityBones, PersonRowBones } from "@/components/friends/rows";
import { Bone, BoneHead, SkeletonScreen } from "@/components/skeleton";

/** The way back and the title, then requests, friends and everyone else; the week's activity beside them on desktop. */
export default function FriendsLoading() {
  return (
    <SkeletonScreen label="Friends">
      <div className="flex flex-col gap-[18px] px-5 lg:gap-[26px] lg:px-10 lg:pt-7">
        <div className="flex flex-col gap-2 lg:gap-4">
          <div className="flex h-[71px] items-center justify-between pt-[27px] lg:h-auto lg:pt-0">
            <Bone className="size-10 rounded-full lg:hidden" />
            <Bone className="hidden h-4 w-20 rounded lg:block" />
            <Bone className="size-10 rounded-full lg:hidden" />
          </div>
          <Bone className="h-[27px] w-32 rounded-md lg:h-[31px]" />
          <Bone className="h-3 w-56 rounded lg:hidden" />
        </div>
        <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-3 lg:items-start lg:gap-10">
          <section className="flex flex-col gap-1">
            <BoneHead />
            <PersonRowBones count={2} />
          </section>
          <section className="flex flex-col gap-1">
            <BoneHead />
            <PersonRowBones count={3} />
          </section>
          <section className="hidden flex-col gap-3.5 lg:flex">
            <BoneHead />
            <ActivityBones />
          </section>
        </div>
      </div>
    </SkeletonScreen>
  );
}
