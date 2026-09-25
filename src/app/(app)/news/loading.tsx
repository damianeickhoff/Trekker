import { PageBody } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/**
 * The News page's bones (Round 10), box for box: the header with its round
 * buttons, the chips, then the lead story and the feed's cards beside the
 * desktop's For you and Your channels cards; on a phone the channels' circles
 * come before the chips and the column stands alone.
 */
export default function NewsLoading() {
  return (
    <SkeletonScreen label="News">
      <PageBody className="lg:gap-6">
        <div className="flex min-h-[71px] items-center gap-3 pt-[27px] lg:min-h-0 lg:items-end lg:pt-0">
          <div className="flex grow items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
            <Bone className="size-10 rounded-full lg:hidden" />
            <Bone className="hidden h-4 w-16 rounded lg:block" />
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-end lg:gap-3.5">
              <Bone className="h-[26px] w-20 rounded-md lg:h-[31px] lg:w-24" />
              <Bone className="h-3 w-32 rounded lg:w-64" />
            </div>
          </div>
          <Bone className="hidden h-10 w-36 rounded-full lg:block" />
          <Bone className="size-10 rounded-full" />
          <Bone className="hidden size-10 rounded-full lg:block" />
        </div>
        <div className="-mt-2 flex gap-3 overflow-hidden lg:hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <Bone key={i} className="size-16 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="-mt-3 flex gap-2 overflow-hidden lg:-mt-2">
          {["w-[72px]", "w-[52px]", "w-[76px]", "w-[86px]", "w-[72px]", "w-[62px]", "w-[88px]", "w-[76px]"].map((w, i) => (
            <Bone key={i} className={`h-8 rounded-full lg:h-[34px] ${w}`} />
          ))}
        </div>
        <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
          <div className="flex flex-col gap-[22px] lg:gap-5">
            <Bone className="aspect-[7/6] rounded-[22px] lg:aspect-video" />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Bone key={i} className="h-[88px] rounded-2xl" />
              ))}
            </div>
          </div>
          <div className="hidden flex-col gap-[18px] lg:flex">
            <Bone className="h-[420px] rounded-[18px]" />
            <Bone className="h-[260px] rounded-[18px]" />
          </div>
        </div>
      </PageBody>
    </SkeletonScreen>
  );
}
