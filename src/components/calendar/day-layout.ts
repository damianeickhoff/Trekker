/**
 * How a desktop day column draws its arrivals, by how many there are. One
 * arrival fills the column's width, up to 200px; two are two 140px posters
 * stacked; three or more are all compact rows, since three posters of any
 * legible size would make that one column far taller than the rest and the
 * whole week would hang down to meet it. A column is a seventh of the content
 * width, so on a narrow laptop both posters shrink with it at the same aspect
 * ratio (`max-w-full`); the caps only stop them growing past what TMDB's w185
 * and w342 images can sharpen on a very wide screen. Phones use the agenda,
 * which does not change.
 */
export type DayLayout =
  | { kind: "poster"; width: 200 | 140; className: string; sizes: string; tick: number; posters: 1 | 2 }
  | { kind: "rows" };

export function dayLayout(count: number): DayLayout {
  if (count >= 3) return { kind: "rows" };
  // Literal class names, so Tailwind finds them in this file.
  return count === 1
    ? { kind: "poster", width: 200, className: "w-full max-w-[200px]", sizes: "200px", tick: 28, posters: 1 }
    : { kind: "poster", width: 140, className: "w-[140px]", sizes: "140px", tick: 24, posters: 2 };
}
