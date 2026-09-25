import { MARK_ASPECT, MARK_GEOMETRY, MARK_VIEWBOX } from "@/lib/logo";

/**
 * The mark, wherever the page draws it rather than an icon: in `currentColor`,
 * so the wordmark sets it amber with `text-accent` and the collapsed sidebar
 * black on its amber disc. Sized by height, the width following from the
 * artwork's shape, because setting both would squash it.
 */
export function TrekkerMark({ height, className = "" }: { height: number; className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      width={Math.round(height * MARK_ASPECT)}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: MARK_GEOMETRY }}
    />
  );
}
