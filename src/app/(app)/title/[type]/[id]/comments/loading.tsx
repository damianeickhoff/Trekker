import { BackHeaderBones } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** Comments: the back button, the title and its line, a few comments and the box. */
export default function CommentsLoading() {
  return (
    <SkeletonScreen label="comments">
      <div className="flex flex-col gap-5 px-5 lg:max-w-[720px] lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeaderBones />
        <div className="flex flex-col gap-3">
          <Bone className="h-3 w-40 rounded" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-2.5">
              <Bone className="size-[30px] rounded-full" />
              <div className="flex grow flex-col gap-1.5">
                <Bone className="h-3 w-28 rounded" />
                <Bone className="h-3 w-4/5 rounded" />
              </div>
            </div>
          ))}
          <Bone className="h-10 w-full rounded-full" />
        </div>
      </div>
    </SkeletonScreen>
  );
}
