import { ListingBones } from "@/components/discover/listing-bones";
import { SkeletonScreen } from "@/components/skeleton";

export default function CategoryLoading() {
  return (
    <SkeletonScreen label="the list">
      <ListingBones chipRows={0} categories />
    </SkeletonScreen>
  );
}
