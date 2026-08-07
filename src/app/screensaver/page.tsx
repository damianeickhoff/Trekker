import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getShowcase } from "@/lib/screensaver";
import { Screensaver } from "@/components/screensaver";

export const metadata = { title: "Screensaver — Trekker" };

/**
 * Never cached. The slideshow is per person — one of the sources is their own
 * watchlist — and the weather on it is a number that is wrong within the hour.
 */
export const dynamic = "force-dynamic";

export default async function ScreensaverPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ from }, showcase, identity] = await Promise.all([
    searchParams,
    getShowcase(user.id),
    db.user.findUnique({
      where: { id: user.id },
      select: { plexAccountId: true, plexUsername: true },
    }),
  ]);

  return (
    <Screensaver
      slides={showcase.slides}
      weather={showcase.weather}
      plexLinked={Boolean(identity?.plexAccountId || identity?.plexUsername)}
      exitTo={safeReturn(from)}
    />
  );
}

/**
 * Where waking up puts you.
 *
 * Whoever sends the reader here says where they came from, so waking lands them
 * back on the page they were reading rather than on the dashboard — and it is a
 * plain push rather than a `router.back()`, because the screensaver may equally
 * have been opened from a bookmark on a device that has no history to go back
 * through.
 *
 * Only ever a path on this instance. A `from` beginning `//` is a protocol-
 * relative URL and would send anyone who followed a doctored link straight off
 * to somebody else's site, which is not a thing a screensaver should be able to
 * do.
 */
function safeReturn(from: string | undefined) {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/";
  return from;
}
