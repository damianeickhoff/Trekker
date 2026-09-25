import { NoteBones } from "@/components/bell/notes";
import { BackHeaderBones, PageBody } from "@/components/page";
import { Bone, SkeletonScreen } from "@/components/skeleton";

/** The way back, the title, then a list of notifications. */
export default function NotificationsLoading() {
  return (
    <SkeletonScreen label="Notifications">
      <PageBody className="gap-2! lg:max-w-[720px] lg:gap-4!">
        <BackHeaderBones />
        <div className="flex flex-col gap-1.5">
          <Bone className="h-3 w-10 rounded" />
          <NoteBones rows={5} />
        </div>
      </PageBody>
    </SkeletonScreen>
  );
}
