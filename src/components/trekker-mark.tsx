import { MARK_GEOMETRY, MARK_VIEWBOX } from "@/lib/logo";

/**
 * The mark, wherever it is drawn in the page rather than baked into an icon.
 *
 * It takes its colour from `currentColor`, so it sits on the accent tile as
 * `text-white` — a literal, because the tile is a fixed colour in both themes
 * and the ink ramp would invert underneath it.
 *
 * Sized by height: the artwork is taller than it is wide, so a caller that sets
 * both dimensions squashes it. `w-auto` beside an `h-*` is the shape of it.
 */
export function TrekkerMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: MARK_GEOMETRY }}
    />
  );
}
