import { BoardBones, XpPanelBones } from "@/components/badges/parts";
import { MobileTop } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";
import { GROUPS } from "@/lib/achievements/catalogue";

/**
 * Level card, badge count and XP breakdown, the group chips, then Closest to
 * earning, the filters and the badge groups; on desktop the board sits beside
 * the column.
 */
export default function BadgesLoading() {
  return (
    <SkeletonScreen label="Badges">
      <MobileTop title="Badges" />
      <div className="flex flex-col gap-5 px-5 pt-2.5 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-7">
        <div className="flex flex-col gap-5 lg:gap-[18px]">
          <div className="flex flex-col gap-3">
            <Bone className="h-24 rounded-[20px] lg:h-[116px]" />
            <Bone className="h-[68px] rounded-2xl" />
            <XpPanelBones />
          </div>
          <div className="-mx-5 flex gap-2 overflow-hidden px-5 lg:hidden">
            {Array.from({ length: 7 }, (_, i) => (
              <Bone key={i} className="h-[34px] w-20 rounded-full" />
            ))}
          </div>
          <div className="hidden flex-col gap-0.5 lg:flex">
            {Array.from({ length: 7 }, (_, i) => (
              <Bone key={i} className={`h-10 rounded-[10px] ${i === 0 ? "" : "opacity-50"}`} />
            ))}
          </div>
          <Bone className="hidden h-8 rounded lg:block" />
        </div>
        <BoardBones groups={GROUPS} />
      </div>
    </SkeletonScreen>
  );
}
