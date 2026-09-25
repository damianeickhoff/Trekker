import { BackHeaderBones } from "../page";
import { Bone } from "../skeleton";
import { GRID_PAGE } from "@/lib/discover";
import { POSTER_GRID } from "./parts";

/** A grid page's posters, as many as a page holds. */
export function PosterGridBones() {
  return (
    <div className={POSTER_GRID}>
      {Array.from({ length: GRID_PAGE }, (_, i) => (
        <Bone key={i} className="aspect-[2/3] w-full rounded-[10px]" />
      ))}
    </div>
  );
}

/** The row of categories: eight chips, running off the edge on phones. */
export function CategoryChipBones() {
  return (
    <div className="flex gap-1.5 overflow-hidden">
      {["w-20", "w-[150px]", "w-[116px]", "w-[106px]", "w-[94px]", "w-[92px]", "w-[122px]", "w-[104px]"].map((w) => (
        <Bone key={w} className={`h-[34px] rounded-full ${w}`} />
      ))}
    </div>
  );
}

/**
 * A category or genre page: the way back, the title and its line, on a
 * category the row of categories, the chips, the grid of posters.
 */
export function ListingBones({ chipRows = 1, categories = false }: { chipRows?: number; categories?: boolean }) {
  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeaderBones />
      {categories && <CategoryChipBones />}
      {Array.from({ length: chipRows }, (_, row) => (
        <div key={row} className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: row === 0 ? 3 : 8 }, (_, i) => (
            <Bone key={i} className="h-[34px] w-24 rounded-full" />
          ))}
        </div>
      ))}
      <PosterGridBones />
    </div>
  );
}
