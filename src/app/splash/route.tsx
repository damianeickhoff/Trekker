import { ImageResponse } from "next/og";

import { MARK_ASPECT, markDataUri } from "@/lib/logo";

/**
 * The launch screen iOS shows between the icon being tapped and the app
 * painting.
 *
 * Android gets one from the manifest — `background_color` plus the icon, drawn
 * by the system. iOS does not: without `apple-touch-startup-image` it shows a
 * blank web view for as long as the first render takes, which on a cold
 * container is several seconds of nothing. That is the blank screen.
 *
 * One route rather than a folder of PNGs because iOS matches these by exact
 * device resolution and there are a dozen of them — see `startupImage` in
 * `layout.tsx` for the list. The dimensions come in as query parameters so the
 * mark stays centred and proportional at every one of them.
 *
 * It is drawn to match `boot.html` and the manifest's `background_color`, so
 * launching goes ink → ink → ink with the mark in the same place throughout,
 * rather than through a flash of something else.
 */

export const contentType = "image/png";

/** The largest iPhone is 1320×2868; anything past this is not a device. */
const MAX = 4096;

function clamp(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), MAX);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const width = clamp(params.get("w"), 1170);
  const height = clamp(params.get("h"), 2532);

  // Proportional to the narrow edge, so the mark is the same size relative to
  // the device whether it is a phone held upright or an iPad on its side.
  const tile = Math.round(Math.min(width, height) * 0.22);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070c",
        }}
      >
        <div
          style={{
            width: tile,
            height: tile,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: Math.round(tile * 0.28),
            background: "#8b5cf6",
          }}
        >
          {/* Satori lays out its own boxes and rasterises the result;
              `next/image` has nothing to do here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={markDataUri()}
            width={Math.round(tile * 0.62 * MARK_ASPECT)}
            height={Math.round(tile * 0.62)}
            alt=""
          />
        </div>
      </div>
    ),
    { width, height },
  );
}
