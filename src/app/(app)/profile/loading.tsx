import { ProfileHeroBones } from "@/components/profile/hero";
import { ProfileBodyBones } from "@/components/profile/sections";
import { SkeletonScreen } from "@/components/skeleton";

/** The hero, then the range switch, the big number and the sections, box for box with `profile/page.tsx`. */
export default function ProfileLoading() {
  return (
    <SkeletonScreen label="Profile">
      <ProfileHeroBones />
      <ProfileBodyBones />
    </SkeletonScreen>
  );
}
