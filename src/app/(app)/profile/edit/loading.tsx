import { BackHeaderBones, PageBody } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** The header, the avatar with its button, the name field and Save. */
export default function EditProfileLoading() {
  return (
    <SkeletonScreen label="Edit profile">
      <PageBody className="lg:max-w-[800px]">
        <BackHeaderBones />
        <div className="flex max-w-[520px] flex-col gap-6">
          <div className="flex items-center gap-4">
            <Bone className="size-[88px] rounded-full" />
            <Bone className="h-10 w-40 rounded-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bone className="h-3 w-12 rounded" />
            <Bone className="h-[46px] rounded-xl" />
          </div>
          <Bone className="h-11 w-24 rounded-full" />
        </div>
      </PageBody>
    </SkeletonScreen>
  );
}
