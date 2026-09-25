import { HomeSkeletonBody } from "@/components/home-skeleton";
import { MobileTop } from "@/components/page";
import { SkeletonScreen } from "@/components/skeleton";

export default function HomeLoading() {
  return (
    <SkeletonScreen label="Home">
      <MobileTop title="wordmark" />
      <HomeSkeletonBody />
    </SkeletonScreen>
  );
}
