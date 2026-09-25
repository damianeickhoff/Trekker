import { SimilarGridBones } from "@/components/title/bones";
import { BackHeaderBones } from "@/components/page";
import { SkeletonScreen } from "@/components/skeleton";

/** More like this: the back button, the title and its line, then the grid of posters. */
export default function SimilarLoading() {
  return (
    <SkeletonScreen label="recommendations">
      <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        <SimilarGridBones count={18} />
      </div>
    </SkeletonScreen>
  );
}
