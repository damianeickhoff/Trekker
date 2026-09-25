import { BackHeaderBones } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** The way back and the title, then days of viewings: a date heading, then the rows, two columns from `lg`. */
export default function HistoryLoading() {
  return (
    <SkeletonScreen label="History">
      <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        {[3, 2, 4].map((rows, d) => (
          <section key={d} className="flex flex-col gap-2.5">
            <Bone className="h-[18px] w-48 rounded" />
            <div className="grid gap-2 lg:grid-cols-2 lg:gap-x-6">
              {Array.from({ length: rows }, (_, i) => (
                <Bone key={i} className="h-[70px] rounded-xl" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </SkeletonScreen>
  );
}
