import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { plexLinked } from "@/lib/now-playing";
import { regionFor } from "@/lib/providers";
import { safeReturn, screensaverSlides } from "@/lib/screensaver";
import { getUpNext } from "@/lib/title-state";
import { weatherLine } from "@/lib/weather";
import { Screensaver } from "./screensaver";

export const metadata: Metadata = { title: "Screensaver" };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The screensaver, outside the signed-in chrome: no sidebar, no tab bar, the
 * window is the artwork. Everything on it is rows (the titles' backdrops from
 * the cache, Up next from `TitleState`) plus the weather, which is one
 * request an hour for the whole instance. `?from=` is where waking returns.
 */
export default async function ScreensaverPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const from = safeReturn((await searchParams).from);

  const row = await db.user.findUnique({ where: { id: user.id }, select: { region: true } });
  const [slides, next, weather, linked] = await Promise.all([
    screensaverSlides(user.id),
    getUpNext(user.id, 1),
    weatherLine(regionFor(row?.region)),
    plexLinked(),
  ]);
  const first = next[0];

  return (
    <Screensaver
      slides={slides}
      upNext={
        first
          ? { title: first.showName, code: `S${pad(first.seasonNumber)} E${pad(first.episodeNumber)}`, episode: first.episodeName }
          : null
      }
      weather={weather}
      from={from}
      plexLinked={linked}
    />
  );
}
