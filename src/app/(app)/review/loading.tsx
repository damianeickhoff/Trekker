import { PageBody } from "@/components/page";
import { ReviewBones } from "@/components/review/parts";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** The way back, the title and the period chips, then the opening card and the four tiles. */
export default function ReviewLoading() {
  return (
    <SkeletonScreen label="Your review">
      <PageBody className="pb-10">
        <div className="flex flex-col gap-2 lg:gap-4">
          <div className="flex h-[71px] items-center pt-[27px] lg:h-auto lg:pt-0">
            <Bone className="size-10 rounded-full lg:hidden" />
            <Bone className="hidden h-4 w-20 rounded lg:block" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Bone className="h-[31px] w-48 rounded-md" />
            <div className="flex gap-1.5">
              <Bone className="h-[34px] w-16 rounded-full" />
              <Bone className="h-[34px] w-20 rounded-full" />
            </div>
          </div>
        </div>
        <ReviewBones />
      </PageBody>
    </SkeletonScreen>
  );
}
