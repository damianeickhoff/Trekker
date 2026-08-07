"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { db } from "./db";
import { IDLE_CHOICES, isSource } from "./screensaver-options";
import type { SettingsState } from "./settings-actions";
import { searchPlaces } from "./weather";

export async function saveScreensaver(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const idle = Number(formData.get("idle"));
  const source = String(formData.get("source") ?? "");
  const place = String(formData.get("place") ?? "").trim();

  const minutes = (IDLE_CHOICES as readonly number[]).includes(idle) ? idle : 0;

  const existing = await db.user.findUnique({
    where: { id: user.id },
    select: { screensaverPlace: true, screensaverLat: true, screensaverLon: true },
  });

  /**
   * The place is geocoded here and only here.
   *
   * Three cases, and the third is the one worth naming: an unchanged name is
   * left entirely alone, so saving a new source does not spend a lookup — and
   * more to the point does not silently move somebody's saved coordinates
   * because a geocoder ranked two villages differently this week than last.
   */
  let weather: {
    screensaverPlace: string | null;
    screensaverLat: number | null;
    screensaverLon: number | null;
  } | null = null;

  if (place.length === 0) {
    weather = { screensaverPlace: null, screensaverLat: null, screensaverLon: null };
  } else if (
    place.toLowerCase() !== (existing?.screensaverPlace ?? "").toLowerCase() ||
    existing?.screensaverLat === null
  ) {
    const [match] = await searchPlaces(place);
    if (!match) {
      return {
        error: `Could not find “${place}”. Try the town or city on its own, or add the country — “Cambridge, US”.`,
      };
    }

    weather = {
      // The geocoder's spelling, not the typed one: "utrecht" typed in a hurry
      // is printed under the temperature for the next two years otherwise.
      screensaverPlace: match.name,
      screensaverLat: match.latitude,
      screensaverLon: match.longitude,
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      screensaverIdle: minutes,
      screensaverSource: isSource(source) ? source : "trending",
      ...(weather ?? {}),
    },
  });

  revalidatePath("/", "layout");

  return {
    ok:
      minutes > 0
        ? `Saved. The screensaver starts after ${minutes} minutes of nothing.`
        : "Saved. It will only start when you ask it to.",
  };
}
