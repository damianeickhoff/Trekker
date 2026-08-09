import { ImageResponse } from "next/og";

import { MARK_ASPECT, markDataUri } from "@/lib/logo";

// iOS home-screen icons have to be raster, so this renders the mark to a PNG.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The manifest also declares this one `maskable`, which means a launcher is
 * free to crop it to a circle. Everything outside the middle 80% is the part it
 * is allowed to take, so the mark is sized to sit inside that and the accent
 * runs full-bleed behind it — the corners are meant to be lost.
 */
const MARK_HEIGHT = 128;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#8b5cf6",
        }}
      >
        {/* Satori lays out its own boxes and rasterises the result; `next/image`
            has nothing to do here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={markDataUri()}
          width={Math.round(MARK_HEIGHT * MARK_ASPECT)}
          height={MARK_HEIGHT}
          alt=""
        />
      </div>
    ),
    size,
  );
}
