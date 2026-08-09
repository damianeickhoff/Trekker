import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trekker",
    short_name: "Trekker",
    description:
      "Track the movies and episodes you watch, discover what's popular, and see where your hours went.",
    // Explicit scope and start_url: without them an installed app can restore a
    // stale document instead of fetching a fresh one on launch.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07070c",
    theme_color: "#07070c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      // The maskable entry used to claim 192×192 for the same 180×180 asset,
      // which is the sort of lie Chrome checks: a size that does not match is
      // dropped, and the icon it would have drawn on the launch splash is
      // dropped with it. Declared at what it actually is instead.
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
