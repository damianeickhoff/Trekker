import { Bone, HeroBone, SkeletonScreen } from "@/components/skeleton";

function EpisodeRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-[54px] items-center gap-3.5 border-b border-line px-1">
          <Bone className="h-3 w-8 rounded" />
          <Bone className="h-3.5 grow rounded" />
          <Bone className="size-7 rounded-full" />
        </div>
      ))}
    </>
  );
}

/**
 * The title page: on phones a dark hero with the lettering large and centred,
 * as most titles draw it on their backdrop; on desktop the poster and details
 * on the hero, then the episodes with the side panels beside them from `xl`.
 */
export default function TitleLoading() {
  return (
    <SkeletonScreen label="title">
      <div className="lg:hidden">
        <div className="-mt-(--safe-top) flex h-[calc(500px+var(--safe-top))] flex-col bg-night pt-(--safe-top)">
          <div className="flex h-[71px] items-center justify-between px-5 pt-[27px]">
            <HeroBone className="size-10 rounded-full" />
            <div className="flex gap-2">
              <HeroBone className="size-10 rounded-full" />
              <HeroBone className="size-10 rounded-full" />
            </div>
          </div>
          <div className="flex grow flex-col items-center justify-end gap-3 px-5 pb-[18px] pt-3.5">
            <HeroBone className="h-20 w-[300px] max-w-full rounded-lg" />
            <HeroBone className="h-3 w-56 rounded" />
            <div className="flex gap-7">
              {[0, 1, 2].map((i) => (
                <HeroBone key={i} className="h-9 w-14 rounded-md" />
              ))}
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <HeroBone key={i} className="h-5 w-20 rounded-md" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 px-5 pt-1">
          <div className="flex gap-2">
            <Bone className="h-[46px] grow rounded-full" />
            <Bone className="size-[46px] rounded-full" />
            <Bone className="size-[46px] rounded-full" />
          </div>
          <Bone className="h-[68px] rounded-[18px]" />
          <Bone className="h-[86px] rounded-[18px]" />
          <div className="flex flex-col">
            <EpisodeRows count={4} />
          </div>
        </div>
      </div>

      <div className="relative hidden lg:block">
        <div className="absolute inset-x-0 top-0 h-[520px] bg-night lg:bleed" />
        <div className="relative grid grid-cols-[250px_minmax(0,1fr)] items-start gap-x-9 gap-y-8 px-10 pt-10 xl:grid-cols-[250px_minmax(0,1fr)_var(--title-aside)] xl:grid-rows-[auto_auto_1fr]">
          <HeroBone className="h-[375px] w-[250px] rounded-2xl" />
          <div className="flex min-w-0 flex-col gap-[18px] pt-4 xl:col-span-2">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <HeroBone key={i} className="h-5 w-20 rounded-md" />
              ))}
            </div>
            <HeroBone className="h-20 w-[420px] max-w-full rounded-lg" />
            <HeroBone className="h-3.5 w-80 rounded" />
            <div className="flex gap-8">
              {[0, 1, 2].map((i) => (
                <HeroBone key={i} className="h-10 w-16 rounded-md" />
              ))}
            </div>
            <div className="flex gap-2">
              <HeroBone className="h-11 w-44 rounded-full" />
              <HeroBone className="h-11 w-28 rounded-full" />
              {[0, 1, 2].map((i) => (
                <HeroBone key={i} className="size-11 rounded-full" />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <HeroBone className="h-3.5 w-[560px] max-w-full rounded" />
              <HeroBone className="h-3.5 w-[480px] max-w-full rounded" />
            </div>
          </div>
          <div className="hidden flex-col gap-4 xl:col-start-3 xl:row-[2/-1] xl:flex">
            <Bone className="h-[68px] rounded-[18px]" />
            <Bone className="h-[86px] rounded-[18px]" />
            <Bone className="h-24 rounded-[18px]" />
          </div>
          <section className="col-span-2 flex min-w-0 flex-col gap-2 wide:max-w-[1100px]">
            <div className="flex gap-2">
              <Bone className="h-[34px] w-24 rounded-full" />
              <Bone className="h-[34px] w-24 rounded-full" />
            </div>
            <Bone className="mt-1 h-3 w-44 rounded" />
            <div className="grid grid-cols-2 gap-x-8">
              <EpisodeRows count={6} />
            </div>
          </section>
        </div>
      </div>
    </SkeletonScreen>
  );
}
