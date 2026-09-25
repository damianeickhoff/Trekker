"use client";

import { useEffect } from "react";
import {
  BACKGROUND_ART_KEY,
  BACKGROUND_COOKIE,
  BACKGROUND_COOKIE_MAX_AGE,
  backgroundArtUrl,
  backgroundCookieValue,
  isPosterPath,
  type Background,
} from "@/lib/background";
import { useBell } from "./bell/bell-provider";

/*
 * The page's background (`lib/background.ts`) is drawn by CSS from what the
 * boot script put on <html> before first paint: `data-background`, `--bg-hue`
 * and, for the artwork, the last poster this browser drew in `--bg-art`. This
 * keeps those in step with the account once the bell's answer lands: today's
 * poster when the day has turned, and the whole choice when it was changed on
 * another device, cookie included, so the next launch paints it at once.
 */

/** Puts a choice on <html> now: Settings' picker, before its save has answered, and the sync below. */
export function applyBackground(b: Background, poster?: string | null) {
  const html = document.documentElement;
  if (b.variant === "plain") delete html.dataset.background;
  else html.dataset.background = b.variant;
  if (b.variant === "colour") html.style.setProperty("--bg-hue", String(b.hue));
  else html.style.removeProperty("--bg-hue");
  if (poster === undefined) return;
  try {
    if (b.variant === "artwork" && isPosterPath(poster)) {
      html.style.setProperty("--bg-art", `url("${backgroundArtUrl(poster)}")`);
      localStorage.setItem(BACKGROUND_ART_KEY, poster);
    } else if (b.variant === "artwork") {
      html.style.removeProperty("--bg-art");
      localStorage.removeItem(BACKGROUND_ART_KEY);
    }
  } catch {
    // Storage refused: the poster still shows, and the next launch waits for the bell for it.
  }
}

function cookieNow() {
  return document.cookie.match(new RegExp(`(?:^|; )${BACKGROUND_COOKIE}=([^;]*)`))?.[1] ?? "plain";
}

export function BackgroundSync() {
  const background = useBell().data?.me?.background;
  const variant = background?.variant;
  const hue = background?.hue;
  const poster = background?.poster ?? null;

  useEffect(() => {
    if (!variant || hue === undefined) return;
    const b: Background = { variant, hue };
    const value = backgroundCookieValue(b);
    if (decodeURIComponent(cookieNow()) !== value) {
      document.cookie = `${BACKGROUND_COOKIE}=${value}; path=/; max-age=${BACKGROUND_COOKIE_MAX_AGE}; samesite=lax`;
    }
    applyBackground(b, variant === "artwork" ? poster : undefined);
  }, [variant, hue, poster]);

  return null;
}
