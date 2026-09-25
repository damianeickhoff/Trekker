import { MobileTop } from "@/components/page";
import { Bone, BoneHead, CardRailBones, SkeletonScreen } from "@/components/skeleton";

/** A list tile: the four-poster mosaic, then its name and count. */
function TileBone({ width }: { width: string }) {
  return (
    <div className={`flex shrink-0 flex-col gap-2.5 ${width}`}>
      <Bone className="aspect-[1.19] w-full rounded-[14px]" />
      <Bone className="h-3.5 w-3/4 rounded" />
      <Bone className="h-2.5 w-1/2 rounded" />
    </div>
  );
}

function RailBones() {
  return (
    <section className="flex flex-col gap-3 lg:gap-3.5">
      <BoneHead />
      <CardRailBones />
    </section>
  );
}

/** The watchlist rail, My lists and Smart lists (side by side on desktop), then the favourites rail. */
export default function ListsLoading() {
  return (
    <SkeletonScreen label="Lists">
      <MobileTop
        title="Lists"
        right={
          <>
            <Bone className="size-10 rounded-full" />
            <Bone className="size-10 rounded-full" />
            <Bone className="size-10 rounded-full" />
            <Bone className="size-10 rounded-full" />
          </>
        }
      />

      <div className="flex flex-col gap-6 px-5 pt-2.5 lg:gap-[26px] lg:px-10 lg:pt-7">
        <div className="hidden items-center gap-4 lg:flex">
          <Bone className="h-8 w-28 rounded-lg" />
          <span className="grow" />
          <Bone className="h-10 w-40 rounded-full" />
          <Bone className="h-10 w-32 rounded-full" />
        </div>
        <RailBones />
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          {[0, 1].map((s) => (
            <section key={s} className="flex min-w-0 flex-col gap-3 lg:gap-3.5">
              <BoneHead />
              <div className="flex gap-3 overflow-hidden">
                {[0, 1, 2].map((i) => (
                  <TileBone key={i} width="w-[150px] lg:w-[164px]" />
                ))}
              </div>
            </section>
          ))}
        </div>
        <RailBones />
      </div>
    </SkeletonScreen>
  );
}
