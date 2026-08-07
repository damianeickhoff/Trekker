import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
      // Trailer stills. The player itself is only loaded once it is asked for,
      // so the resting state of a trailer is one of these.
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
    /**
     * TMDB already serves pre-sized images (w185/w342/w780/w1280) from a CDN,
     * and the code picks the right size per surface. Re-optimising them adds a
     * server round trip per image with a bounded worker pool: a screen that
     * mounts twenty posters at once can exhaust it, and the ones that time out
     * render as broken images. Going straight to the CDN removes that whole
     * failure mode.
     */
    unoptimized: true,
  },
};

export default nextConfig;
