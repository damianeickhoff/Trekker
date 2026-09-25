import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsScreen } from "@/components/settings/screen";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings' index: the Profile section on a desktop, the whole page of folded
 * cards on a phone. Each other section has an address of its own
 * (`[section]`, and `badges`). A Plex sign-in used to come back here with
 * `?plex=`; it now lands on Connections, and an old link is sent on there.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ plex?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { plex } = await searchParams;
  if (typeof plex === "string") redirect(`/settings/connections?plex=${encodeURIComponent(plex.slice(0, 200))}`);
  return <SettingsScreen userId={user.id} section="profile" />;
}
