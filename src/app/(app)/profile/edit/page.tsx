import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Back } from "@/components/back-button";
import { BackHeader, PageBody } from "@/components/page";
import { EditProfileForm } from "@/components/profile/edit-form";
import { getCurrentUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Edit profile" };

/** Your name and picture. One way in, from the profile, so the way back names it. */
export default async function EditProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const row = await db.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, avatarSetAt: true } });
  if (!row) redirect("/login");
  return (
    <PageBody className="lg:max-w-[800px]">
      <BackHeader
        back={<Back href="/profile" name="Profile" />}
        title="Edit profile"
        meta={<span className="mono-label">Friends see this name and picture</span>}
      />
      <EditProfileForm id={row.id} name={row.name} avatar={avatarUrl(row)} />
    </PageBody>
  );
}
