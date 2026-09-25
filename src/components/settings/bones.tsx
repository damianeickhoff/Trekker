import { Bone, SkeletonScreen } from "../skeleton";

/**
 * Settings' skeleton, box for box, for every section's address: on a phone
 * the profile card and the folded cards under their group headings; on a
 * desktop the list of sections beside a section's heading and rows. `current`
 * is the list entry drawn solid.
 */
export function SettingsBones({ current = 0, rows = 3 }: { current?: number; rows?: number }) {
  return (
    <SkeletonScreen label="Settings">
      <div className="flex flex-col gap-2 px-5 lg:grid lg:grid-cols-[300px_minmax(0,760px)] lg:items-start lg:gap-12 lg:px-10 lg:pt-7">
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-2 lg:gap-4">
            <div className="flex h-[71px] items-center pt-[27px] lg:h-auto lg:pt-0">
              <Bone className="size-10 rounded-full lg:hidden" />
              <Bone className="hidden h-4 w-16 rounded lg:block" />
            </div>
            <Bone className="h-7 w-28 rounded-lg lg:h-8 lg:w-32" />
          </div>
          <div className="flex flex-col gap-2 lg:hidden">
            <Bone className="h-3 w-10 rounded" />
            <Bone className="h-[72px] rounded-2xl" />
          </div>
          <div className="hidden flex-col gap-1 lg:flex">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-[14px] px-2.5 py-2 ${i === current ? "" : "opacity-50"}`}>
                <Bone className="size-[34px] rounded-[10px]" />
                <div className="flex grow flex-col gap-1.5">
                  <Bone className="h-3.5 w-24 rounded" />
                  <Bone className="h-3 w-40 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 lg:gap-5">
          <div className="hidden flex-col gap-2 lg:flex">
            <Bone className="h-6 w-40 rounded-md" />
            <Bone className="h-3.5 w-80 rounded" />
          </div>
          {[7, 2].map((cards, g) => (
            <div key={g} className="flex flex-col gap-2 lg:hidden">
              {g > 0 && <Bone className="mt-4 h-3 w-40 rounded" />}
              {Array.from({ length: cards }, (_, i) => (
                <Bone key={i} className="h-[62px] rounded-2xl" />
              ))}
            </div>
          ))}
          <div className="hidden flex-col gap-1 lg:flex">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-14 items-center gap-3 border-b border-line py-2">
                <div className="flex grow flex-col gap-1.5">
                  <Bone className="h-3.5 w-32 rounded" />
                  <Bone className="h-3 w-48 rounded" />
                </div>
                <Bone className="h-[26px] w-11 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}
