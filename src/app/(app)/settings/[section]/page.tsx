import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SECTION_COPY, type SettingsSection } from "@/components/settings/nav-items";
import { SettingsScreen } from "@/components/settings/screen";
import { getCurrentUser } from "@/lib/auth";

/** The sections with an address of their own here; Profile is the index and Badges has its own gate. */
const HERE = ["appearance", "subscriptions", "notifications", "news", "connections", "account"] as const satisfies SettingsSection[];
type Here = (typeof HERE)[number];
const isHere = (s: string): s is Here => (HERE as readonly string[]).includes(s);

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: isHere(section) ? `${SECTION_COPY[section].label} · Settings` : "Settings" };
}

/**
 * One section of Settings: that section alone beside the list on a desktop,
 * the whole page with its card open on a phone, so a reload and the back
 * button keep the place, and one link lands right at either width.
 */
export default async function SettingsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ plex?: string }>;
}) {
  const { section } = await params;
  if (!isHere(section)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { plex } = await searchParams;
  return (
    <SettingsScreen
      userId={user.id}
      section={section}
      plexMessage={section === "connections" && typeof plex === "string" ? plex : null}
    />
  );
}
