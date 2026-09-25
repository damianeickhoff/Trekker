import { BacklogBones, CalendarHeaderBones, ComingUpBones, WeekBones } from "@/components/calendar-skeleton";
import { MobileTop } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** Week strip and agenda on phones; seven day columns on desktop; Coming up and the backlog below both. */
export default function CalendarLoading() {
  return (
    <SkeletonScreen label="Calendar">
      <MobileTop
        title="Calendar"
        right={
          <>
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="size-10 rounded-full" />
            ))}
          </>
        }
      />
      <div className="flex flex-col gap-[18px] px-5 pt-2.5 lg:gap-[22px] lg:px-10 lg:pt-7">
        <CalendarHeaderBones />
        <WeekBones />
        <ComingUpBones />
        <BacklogBones />
      </div>
    </SkeletonScreen>
  );
}
