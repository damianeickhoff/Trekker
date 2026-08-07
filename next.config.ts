import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Traces the server and its dependencies into `.next/standalone`, so the
   * runtime image can be the built output plus a Node runtime — no
   * `node_modules`, no source, no build tools. Without this a container has to
   * carry the whole dependency tree to run one server.
   */
  output: "standalone",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
      // Trailer stills. The player itself is only loaded once it is asked for,
      // so the resting state of a trailer is one of these.
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
      // Plex Home profile pictures, on the "who's watching?" screen. plex.tv
      // serves them from a couple of hosts depending on how the avatar was set.
      { protocol: "https", hostname: "plex.tv" },
      { protocol: "https", hostname: "**.plex.tv" },
      { protocol: "https", hostname: "**.gravatar.com" },
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
