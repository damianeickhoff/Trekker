import { BACKLOG_POSTER } from "./calendar/backlog";
import { Bone, BoneHead, BoneRail } from "./skeleton";

/*
 * The calendar's skeleton, in the pieces the page streams: the header (only
 * in `loading.tsx`, since the page draws its own at once), the week, Coming
 * up and the backlog. The route's loading state and the page's boundaries
 * share them, so the real week lands where its bones were.
 */

export function CalendarHeaderBones() {
  return (
    <>
      <div className="flex items-baseline justify-between lg:hidden">
        <Bone className="h-3 w-44 rounded" />
        <Bone className="h-3 w-16 rounded" />
      </div>
      <div className="hidden items-center gap-4 lg:flex">
        <Bone className="h-8 w-44 rounded-lg" />
        <Bone className="h-3 w-40 rounded" />
        <span className="grow" />
        <Bone className="h-[38px] w-20 rounded-full" />
        <Bone className="size-10 rounded-full" />
        <Bone className="size-10 rounded-full" />
      </div>
    </>
  );
}

/** Week strip and agenda on phones; seven day columns on desktop. */
export function WeekBones() {
  return (
    <>
      <div className="flex flex-col gap-[18px] lg:hidden">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <Bone key={i} className="h-[70px] rounded-[14px]" />
          ))}
        </div>
        {[1, 3, 1].map((items, s) => (
          <section key={s} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2.5">
              <Bone className="h-[17px] w-16 rounded-md" />
              <Bone className="h-3 w-14 rounded" />
            </div>
            {Array.from({ length: items }, (_, i) => (
              <Bone key={i} className="h-[86px] rounded-[14px]" />
            ))}
          </section>
        ))}
      </div>

      <div className="hidden grid-cols-7 gap-2.5 lg:grid">
        {[0, 1, 3, 0, 2, 0, 1].map((items, d) => (
          <div key={d} className="flex min-w-0 flex-col gap-2.5 p-3">
            <Bone className="h-[26px] w-12 rounded-md" />
            {items === 1 && <Bone className="aspect-[2/3] w-full max-w-[200px] rounded-[10px]" />}
            {items === 2 &&
              [0, 1].map((i) => <Bone key={i} className="aspect-[2/3] w-[140px] max-w-full rounded-[10px]" />)}
            {items >= 3 &&
              [0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Bone className="h-[54px] w-9 rounded-[5px]" />
                  <Bone className="h-3 grow rounded" />
                </div>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function ComingUpBones() {
  return (
    <section className="flex flex-col gap-3 pt-1 lg:gap-3.5">
      <BoneHead />
      <BoneRail count={6} tile="h-[132px] w-[236px] rounded-xl lg:h-[134px] lg:w-[240px]" />
    </section>
  );
}

/** The backlog: its head and a rail of posters, each with its "N left" line under it. */
export function BacklogBones() {
  return (
    <section className="flex flex-col gap-3 pt-1 lg:gap-3.5">
      <BoneHead />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex shrink-0 flex-col gap-1.5">
            <Bone className={`rounded-[10px] ${BACKLOG_POSTER}`} />
            <Bone className="h-3 w-12 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
