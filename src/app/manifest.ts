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
      { src: "/apple-icon", sizes: "192x192", type: "image/png", purpose: "maskable" },
    ],
  };
}
