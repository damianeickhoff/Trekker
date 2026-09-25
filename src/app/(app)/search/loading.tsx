import { Bone, BoneHead, SkeletonScreen } from "@/components/skeleton";

function ResultBone() {
  return (
    <div className="flex items-center gap-3">
      <Bone className="h-[66px] w-11 rounded-md" />
      <div className="flex grow flex-col gap-1.5">
        <Bone className="h-3.5 w-3/4 rounded" />
        <Bone className="h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}

/** Search box, filter chips, then shows, films and people: stacked on phones, three columns on desktop. */
export default function SearchLoading() {
  return (
    <SkeletonScreen label="Search">
      <div className="flex flex-col gap-[18px] px-5 pt-4 lg:mx-auto lg:max-w-[1040px] lg:gap-6 lg:px-10 lg:pt-10">
        <div className="flex items-center gap-2.5">
          <Bone className="h-12 grow rounded-[14px] lg:h-14 lg:rounded-2xl" />
          <Bone className="h-4 w-14 rounded lg:hidden" />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} className="h-[34px] w-24 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3 lg:gap-10">
          {[0, 1, 2].map((s) => (
            <section key={s} className="flex min-w-0 flex-col gap-3">
              <BoneHead />
              {[0, 1, 2].map((i) => (
                <ResultBone key={i} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  );
}
