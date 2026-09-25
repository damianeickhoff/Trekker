"use client";

/**
 * Another site's picture, at the size it publishes (not TMDB's, so not the
 * image loader's), drawn over the `NoPicture` placeholder that `NewsPicture`
 * lays beneath it. A picture that fails to load hides itself, so a dead
 * address shows the placeholder rather than an empty box (Round 10, last
 * review). One that failed before hydration is caught when the ref attaches:
 * complete, and no width.
 */
export function FeedImg({ src, className, eager = false }: { src: string; className: string; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) img.hidden = true;
      }}
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={(e) => {
        e.currentTarget.hidden = true;
      }}
      className={className}
    />
  );
}
