import { ProfileHeroBones } from "@/components/profile/hero";
import { ProfileBodyBones } from "@/components/profile/sections";
import { SkeletonScreen } from "@/components/skeleton";

/** A friend's profile is your own less Edit, Share and Friends; a stranger's is the hero alone, which this covers. */
export default function OtherProfileLoading() {
  return (
    <SkeletonScreen label="Profile">
      <ProfileHeroBones />
      <ProfileBodyBones own={false} />
    </SkeletonScreen>
  );
}
