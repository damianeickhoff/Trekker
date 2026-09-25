import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Traces the server and its dependencies into `.next/standalone`, so the
   * runtime image is the built output plus Node and nothing else.
   */
  output: "standalone",
  poweredByHeader: false,
  /**
   * Gzip is the production server's to do (or the proxy in front of it). The
   * dev server wraps every streamed action response in one Gzip stream and
   * Next attaches a drain listener per write, which trips Node's listener
   * warning on a busy page; nothing on localhost needs compressing anyway.
   */
  compress: process.env.NODE_ENV !== "development",

  images: {
    // TMDB's own sizes, not the optimiser's: see the loader for why.
    loader: "custom",
    loaderFile: "./src/lib/tmdb-image-loader.ts",
    // Every width in a srcset is one TMDB already serves, so each candidate the
    // browser weighs is a real file at its real width, and the loader never
    // has to round one to another. Which the browser picks is `sizes` times
    // the screen density: a 108px phone rail at 2x takes w342, a 112px desktop
    // rail at 1x takes w154.
    imageSizes: [92, 154, 185, 342],
    deviceSizes: [500, 780, 1280],
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" }],
  },

  async headers() {
    return [
      {
        // The worker decides what every later launch paints, so the browser
        // must always ask for a fresh copy. Its version string changes per
        // build, which is what retires the old caches.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
