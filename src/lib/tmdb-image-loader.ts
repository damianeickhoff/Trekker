/**
 * `next/image` loader for TMDB artwork. TMDB already serves each image at a
 * fixed set of widths, so rather than have the optimiser download the
 * original and resize it on this server, the srcset Next builds is mapped onto
 * those widths: the browser picks a size, and TMDB's CDN answers it directly.
 *
 * Callers pass `tmdbSrc(path)`, the `original` URL; anything else passes
 * through untouched.
 */

const WIDTHS = [92, 154, 185, 342, 500, 780, 1280];
const ORIGINAL = "https://image.tmdb.org/t/p/original/";

export function tmdbSrc(path: string) {
  return `${ORIGINAL}${path.replace(/^\//, "")}`;
}

export default function tmdbImageLoader({ src, width }: { src: string; width: number }) {
  if (!src.startsWith(ORIGINAL)) return src;
  const size = WIDTHS.find((w) => w >= width);
  return src.replace("/original/", size ? `/w${size}/` : "/original/");
}
