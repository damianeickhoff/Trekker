import { ImageResponse } from "next/og";
import { MARK_ASPECT, markDataUri } from "@/lib/logo";

/**
 * App icons, drawn at build time: the mark in black on an amber tile, the
 * accent being the one colour that is the app's own (STYLE.md, The accent).
 * The home-screen sizes are full-bleed, since the platform cuts its own
 * shape, with the mark inside the maskable safe zone so one image serves
 * both purposes; the favicon is a rounded tile with the mark larger, because
 * at 16px every pixel of margin is one the mark cannot use. Shapes only, so
 * no font is fetched to render them.
 */
const SIZES = [32, 180, 192, 512];

export const dynamicParams = false;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  const favicon = size <= 32;
  const height = Math.round(size * (favicon ? 0.74 : 0.56));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F2B233",
          borderRadius: favicon ? Math.round(size * 0.22) : 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rasterised by ImageResponse, not a page image */}
        <img src={markDataUri("#000000")} width={Math.round(height * MARK_ASPECT)} height={height} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
