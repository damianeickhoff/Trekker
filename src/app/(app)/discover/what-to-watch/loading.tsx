import { VibeBones } from "@/components/discover/quiz";
import { MobileTop } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** A question: the title row, the progress line, the question, the answers and the way on. */
export default function QuizLoading() {
  return (
    <SkeletonScreen label="the question">
      <MobileTop title="What to watch" right={<Bone className="size-10 rounded-full" />} />
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-[18px] px-5 pt-2 lg:gap-7 lg:px-10 lg:pt-10">
        <div className="hidden items-center justify-between lg:flex">
          <Bone className="h-8 w-48 rounded-lg" />
          <Bone className="size-10 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Bone className="h-3 w-28 rounded" />
          <Bone className="h-1 w-full rounded-sm" />
        </div>
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <Bone className="h-[30px] w-4/5 rounded-lg lg:h-11" />
          <Bone className="h-3 w-3/5 rounded" />
        </div>
        <VibeBones count={4} />
      </div>
    </SkeletonScreen>
  );
}
