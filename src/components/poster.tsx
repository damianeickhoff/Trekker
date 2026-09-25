import Image from "next/image";
import { tmdbSrc } from "@/lib/tmdb-image-loader";

/**
 * The stand-in for a poster TMDB has none of: the tile at the poster's own
 * size, with the title typed at its foot (`poster-placeholder` in
 * `globals.css`). Hidden from assistive tech, because whatever wraps a poster
 * already names the title; a placeholder that spoke would say it twice.
 */
export function PosterPlaceholder({ title, className = "" }: { title?: string | null; className?: string }) {
  return (
    <span aria-hidden="true" className={`poster-placeholder shrink-0 ${className}`}>
      {title ? <span>{title}</span> : null}
    </span>
  );
}

/**
 * A TMDB poster at the size it is drawn. `sizes` is what lets the browser pick
 * a width and the loader map it to one TMDB already serves; without a path it
 * is the placeholder above, so a missing poster keeps the layout rather than
 * collapsing, and still says what it is.
 */
export function Poster({
  path,
  alt,
  title,
  width,
  height,
  sizes,
  className = "",
  priority = false,
}: {
  path: string | null;
  alt: string;
  /** Typed on the placeholder when there is no artwork. */
  title?: string | null;
  width: number;
  height: number;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  if (!path) return <PosterPlaceholder title={title} className={className} />;
  return (
    <Image
      src={tmdbSrc(path)}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className={`block shrink-0 object-cover ${className}`}
    />
  );
}
