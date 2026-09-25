import { ListingBones } from "@/components/discover/listing-bones";
import { SkeletonScreen } from "@/components/skeleton";

export default function GenreLoading() {
  return (
    <SkeletonScreen label="the genre">
      <ListingBones />
    </SkeletonScreen>
  );
}
