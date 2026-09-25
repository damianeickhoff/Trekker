import { ListingBones } from "@/components/discover/listing-bones";
import { SkeletonScreen } from "@/components/skeleton";

export default function ForYouLoading() {
  return (
    <SkeletonScreen label="the list">
      <ListingBones categories />
    </SkeletonScreen>
  );
}
