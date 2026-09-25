import { Bone, BoneHead, CardRailBones } from "./skeleton";

/*
 * Home's skeleton, in pieces. Each piece is the fallback of the Suspense
 * boundary for one tier, and `HomeSkeletonBody` is all of them at once for the
 * route's `loading.tsx` (what the service worker's cached shell shows first).
 * One set of pieces for both means the real content always lands where its
 * bones were.
 *
 * Home is one flex column in the same order at every width: the date on
 * desktop, the challenges strip, the card, Also waiting where the card does
 * not carry it, Landing soon, Trending this week, then Recently watched. Each
 * piece carries the same `order-*` classes as the content it stands for.
 */

export function HomeHeaderBones() {
  return <Bone className="order-0 hidden h-7 w-80 rounded-md lg:block" />;
}

/** The card, and Also waiting where it is a list of its own. */
export function UpNextBones() {
  return (
    <>
      <div className="order-2 flex items-center gap-4 rounded-[22px] bg-surface p-4 lg:gap-[26px] lg:p-6">
        <Bone className="h-[150px] w-[100px] rounded-[10px] lg:h-[225px] lg:w-[150px] lg:rounded-[14px]" />
        <div className="flex min-w-0 grow flex-col gap-2.5 lg:gap-3.5">
          <div className="flex gap-1.5">
            <Bone className="h-6 w-[76px] rounded-md" />
            <Bone className="h-6 w-[110px] rounded-md lg:w-[200px]" />
          </div>
          <Bone className="hidden h-[15px] w-[220px] rounded lg:block" />
          <Bone className="h-6 w-4/5 rounded-md lg:h-11 lg:w-[46%] lg:rounded-lg" />
          <Bone className="h-[13px] w-3/5 rounded lg:hidden" />
          <div className="hidden gap-2 lg:flex">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="h-6 w-[90px] rounded-md" />
            ))}
          </div>
          {/* The episode's synopsis, two lines. */}
          <Bone className="hidden h-[44px] w-full max-w-[560px] rounded lg:block" />
          <div className="flex gap-2 pt-1">
            <Bone className="h-10 w-[120px] rounded-[20px] lg:h-[46px] lg:w-[130px] lg:rounded-[23px]" />
            <Bone className="size-10 rounded-[20px] lg:size-[46px] lg:rounded-[23px]" />
          </div>
        </div>
        {/* The panel: its head, three rows and "Show all N". */}
        <Bone className="hidden h-[358px] w-[420px] rounded-2xl xl:block" />
      </div>

      <section className="order-3 flex flex-col gap-3 xl:hidden">
        <BoneHead />
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-x-3">
          {[0, 1, 2].map((i) => (
            <WaitingRowBones key={i} />
          ))}
        </div>
      </section>
    </>
  );
}

/** One Also waiting row: a surface on phones, plain from `lg`, like the row. */
export function WaitingRowBones() {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-surface py-2.5 pl-2.5 pr-3 shadow-elevation lg:rounded-none lg:bg-transparent lg:px-0 lg:py-1 lg:shadow-none">
      <Bone className="h-[66px] w-11 rounded-[7px]" />
      <div className="flex grow flex-col gap-1.5">
        <Bone className="h-[11px] w-[60px] rounded" />
        <Bone className="h-3.5 w-[70%] rounded" />
        <Bone className="h-3 w-1/2 rounded" />
      </div>
      <Bone className="size-7 rounded-full" />
    </div>
  );
}

export function LandingBones() {
  return (
    <section className="order-5 flex flex-col gap-3 lg:gap-3.5">
      <BoneHead />
      <CardRailBones count={5} wide />
    </section>
  );
}

export function TrendingBones() {
  return (
    <section className="order-6 flex flex-col gap-3 lg:gap-3.5">
      <BoneHead />
      <CardRailBones />
    </section>
  );
}

export function RecentBones() {
  return (
    <section className="order-9 flex flex-col gap-3 lg:gap-3.5">
      <BoneHead />
      <CardRailBones />
    </section>
  );
}

/**
 * The challenges strip, as its folded line at both widths: most people leave
 * it folded, and an open strip growing under a one-line bone is a smaller jump
 * than three tiles' worth of bone collapsing.
 */
export function ChallengeBannerBones() {
  return <Bone className="order-1 h-11 rounded-2xl lg:h-12" />;
}

export function HomeSkeletonBody() {
  return (
    <div className="flex flex-col gap-6 px-5 pt-2.5 lg:gap-7 lg:px-10 lg:pt-7">
      <HomeHeaderBones />
      <ChallengeBannerBones />
      <UpNextBones />
      <LandingBones />
      <TrendingBones />
      <RecentBones />
    </div>
  );
}
