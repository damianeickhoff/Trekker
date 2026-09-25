import { Bone, BoneHead, CardRailBones, HeroBone } from "../skeleton";
import { BAND, BandArt } from "./parts";

/*
 * Discover's bones, box for box: each is the fallback of the Suspense boundary
 * it stands for, and `loading.tsx` draws them all at once.
 */

/** One scrolling row of 184×86 tiles at every width. */
export function GenreBones() {
  return (
    <section className="flex flex-col gap-2.5 lg:gap-3">
      <BoneHead />
      <div className="flex gap-(--card-gap) overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <Bone key={i} className="h-[86px] w-[184px] rounded-xl" />
        ))}
      </div>
    </section>
  );
}

/** The rest of the top 20: each place is its number's 48px gutter, 6px and the chart poster with its caption. */
export function TrendingBones() {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
      <BoneHead />
      <div className="flex gap-(--card-gap) overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="ml-[54px] flex w-(--chart-card) shrink-0 flex-col gap-1.5">
            <Bone className="h-(--chart-card-h) w-full rounded-[10px]" />
            <Bone className="mt-0.5 h-3.5 w-4/5 rounded" />
            <Bone className="h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function BillboardBones() {
  return (
    <section className="flex flex-col gap-2.5 lg:gap-3">
      <BoneHead />
      <CardRailBones count={5} wide />
    </section>
  );
}

/** One rail of posters: Things you may like, Popular shows and films, New shows. */
export function PosterRailBones() {
  return (
    <section className="flex flex-col gap-2.5 lg:gap-3">
      <BoneHead />
      <CardRailBones />
    </section>
  );
}

/**
 * On the horizon: its band, plain night until the art is known, with the
 * eyebrow, its line, and the first of its rails in the band's translucent white.
 */
export function EyebrowBones() {
  return (
    <div className={BAND}>
      <BandArt path={null} />
      <div className="flex flex-col gap-1.5">
        <HeroBone className="h-3 w-28 rounded" />
        <HeroBone className="h-3 w-56 rounded" />
      </div>
      <section className="flex flex-col gap-2.5 lg:gap-3">
        <HeroBone className="h-5 w-40 rounded-md" />
        <CardRailBones hero />
      </section>
    </div>
  );
}

