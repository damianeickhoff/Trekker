import { Bone, BoneHead } from "../skeleton";
import { SIMILAR_GRID } from "./styles";

/*
 * The title pages' skeleton pieces. Each is the fallback of one Suspense
 * boundary and is shaped like what lands in it, so nothing moves when it does.
 */

export function PanelBones({ className = "h-[68px]" }: { className?: string }) {
  return <Bone className={`w-full rounded-[18px] ${className}`} />;
}

export function EpisodeRowBones({ count }: { count: number }) {
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

export function EpisodeListBones() {
  return (
    <div className="flex flex-col gap-2 wide:max-w-[1100px]">
      <div className="flex gap-2 py-1">
        <Bone className="h-[34px] w-24 rounded-full" />
        <Bone className="h-[34px] w-24 rounded-full" />
      </div>
      <Bone className="mt-1 h-3 w-44 rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
        <EpisodeRowBones count={6} />
      </div>
    </div>
  );
}

/** The cast rail: from `lg` the same spread row of whole tiles as `CastRail`. */
export function PeopleRailBones() {
  return (
    <div className="flex flex-col gap-3 lg:gap-3.5">
      <BoneHead />
      <div className="flex gap-2.5 overflow-hidden lg:grid lg:auto-rows-[0px] lg:grid-cols-[repeat(auto-fill,var(--poster-desk))] lg:grid-rows-[auto] lg:justify-between lg:gap-x-(--tile-gap) lg:gap-y-0">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex w-[92px] shrink-0 flex-col gap-2 lg:w-full">
            <Bone className="aspect-[4/5] w-full rounded-[14px]" />
            <Bone className="h-3 w-4/5 rounded" />
            <Bone className="h-3 w-3/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AsideBones({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Bone className="h-3 w-40 rounded" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: rows * 3 }, (_, i) => (
          <Bone key={i} className="h-[34px] w-24 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function MoreLikeBones() {
  return (
    <div className="flex flex-col gap-3">
      <BoneHead />
      <div className="flex gap-3 overflow-hidden xl:grid xl:grid-cols-4 xl:gap-(--tile-gap)">
        {Array.from({ length: 8 }, (_, i) => (
          <Bone key={i} className="aspect-[2/3] w-[108px] rounded-[10px] lg:w-(--poster-desk) xl:w-auto" />
        ))}
      </div>
    </div>
  );
}

/** A page of recommendations: the same tiles in a grid (see `SimilarGrid`). */
export function SimilarGridBones({ count = 12 }: { count?: number }) {
  return (
    <div className={SIMILAR_GRID}>
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className="aspect-[2/3] w-full rounded-[10px]" />
      ))}
    </div>
  );
}
