import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SettingsScreen } from "@/components/settings/screen";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Badges · Settings" };

/**
 * Settings' Badges section, the admin's take-back (`BadgesTool`): on a
 * desktop the section beside the list, on a phone the whole page with the
 * Badges card open and the tool inside it. Anyone but the admin gets a 404,
 * from the layout before anything streams; the check here is the same one
 * again, so the page never relies on where it is mounted. `?u=` chooses the
 * account; without it, the admin's own.
 */
export default async function AdminBadgesPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdmin(user.id))) notFound();
  const { u } = await searchParams;
  return <SettingsScreen userId={user.id} section="badges" badgesFor={u} />;
}
