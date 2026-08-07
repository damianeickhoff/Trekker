import { ImageResponse } from "next/og";

// iOS home-screen icons have to be raster, so this renders the mark to a PNG.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "linear-gradient(135deg, #8b5cf6 0%, #f59e0b 100%)",
          color: "#07070c",
          fontSize: 116,
          fontWeight: 900,
        }}
      >
        T
      </div>
    ),
    size,
  );
}
