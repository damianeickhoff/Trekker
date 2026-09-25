import { WaitingRowBones } from "@/components/home-skeleton";
import { BackHeaderBones } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/**
 * Still to watch: the back button on its own row, the title and its line, the
 * four sort chips, then rows, in two columns from `lg`. The same boxes as the
 * page, so it lands without moving.
 */
export default function WaitingLoading() {
  return (
    <SkeletonScreen label="Still to watch">
      <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        <div className="flex gap-1.5 overflow-hidden">
          {["w-[124px]", "w-[62px]", "w-[98px]", "w-[126px]"].map((w) => (
            <Bone key={w} className={`h-[34px] rounded-full ${w}`} />
          ))}
        </div>
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-x-8">
          {Array.from({ length: 10 }, (_, i) => (
            <WaitingRowBones key={i} />
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
