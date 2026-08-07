import { Skeleton } from "@/components/ui";

/**
 * The episode route's own skeleton, and the reason it must exist.
 *
 * Without one, this route falls back to the skeleton at `title/[type]/[id]`,
 * which carries `.title-page` — the marker the phone's dark treatment keys off.
 * That marker turns the whole ink ramp dark through `:has()`, and it does not
 * only do it while loading: the fallback stays in the tree, so an episode page
 * in the light theme was rendering with every surface, every border and the
 * page background itself still set to their dark values.
 *
 * An episode is not a title page. It follows the theme, so it needs a skeleton
 * that says so by not claiming to be one.
 */
export default function Loading() {
  return (
    <div className="rise">
      <div className="h-[42px]" />
      <Skeleton className="aspect-video w-full rounded-2xl" />

      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      </div>

      <Skeleton className="mt-5 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-1.5 h-4 w-full max-w-2xl" />
      <Skeleton className="mt-1.5 h-4 w-2/3 max-w-2xl" />
    </div>
  );
}
