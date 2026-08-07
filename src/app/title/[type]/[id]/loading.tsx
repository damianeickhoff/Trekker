import { Skeleton, SkeletonRail } from "@/components/ui";

/**
 * The title page's own shape while it is being fetched.
 *
 * `title-page` is on the wrapper deliberately, and it is the important part. The
 * whole treatment — the dark palette whatever the theme, the hidden header, the
 * main element's dropped padding — hangs off `body:has(.title-page)`, and
 * without it here the loading state was a *different page*: it kept the header,
 * kept the padding, and in the light theme it was white. Which is exactly what
 * the reader saw for the fraction of a second before the real page replaced it,
 * as a flash and a jump.
 *
 * Matching the class means the two states are the same page in the same place,
 * and the only thing that changes when the content lands is that the grey blocks
 * become the film.
 */
export default function Loading() {
  return (
    <div className="rise title-page">
      {/* The back row's own height, so nothing below it moves when it arrives. */}
      <div className="h-[42px]" />

      {/* Phone: the artwork is the page, full-bleed and running off the top.
          Desktop: a banner above a poster-and-detail row, as it always was. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[calc(66px_+_env(safe-area-inset-top))] left-1/2 -z-10 h-[600px] w-screen -translate-x-1/2 sm:hidden"
      >
        {/*
          Not a `Skeleton`. The sheen that reads as "loading" on a chip-sized
          block becomes a pale bar travelling across half the screen at this
          size — which is what the white wipe over the top of the page was. A
          plain gradient in the hero's own shape says the same thing quietly,
          and lands in roughly the place the artwork's fade will.
        */}
        <div className="h-full w-full bg-gradient-to-b from-ink-800 via-ink-800/60 to-transparent" />
      </div>

      <Skeleton className="mb-6 hidden h-72 w-full rounded-2xl sm:block" />

      <div className="flex gap-5 max-sm:flex-col">
        <Skeleton className="hidden aspect-2/3 w-40 shrink-0 rounded-xl sm:block" />

        {/* Centred and pushed down the artwork on a phone, left-aligned beside
            the poster on desktop — the same two arrangements the real hero has. */}
        <div className="min-w-0 grow max-sm:flex max-sm:flex-col max-sm:items-center max-sm:pt-[228px]">
          <Skeleton className="h-10 w-56 max-sm:h-20 max-sm:w-64" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-40" />

          <Skeleton className="mt-5 h-4 w-full max-w-md" />
          <Skeleton className="mt-1.5 h-4 w-full max-w-md" />
          <Skeleton className="mt-1.5 h-4 w-2/3 max-w-md" />

          <div className="mt-6 flex w-full flex-wrap items-center gap-2.5 max-sm:justify-center">
            <Skeleton className="h-[50px] flex-1 rounded-xl sm:w-36 sm:flex-none" />
            <Skeleton className="h-[50px] flex-1 rounded-xl sm:w-32 sm:flex-none" />
            <Skeleton className="h-[50px] w-[50px] shrink-0 rounded-xl" />
            <Skeleton className="h-[50px] w-[50px] shrink-0 rounded-xl" />
          </div>
        </div>
      </div>

      <SkeletonRail label="Loading cast" />
      <SkeletonRail label="Loading recommendations" />
    </div>
  );
}
