import Image from "next/image";
import { img } from "@/lib/tmdb";

/**
 * Full-bleed artwork behind the top of a title page. It reaches up under the
 * sticky header and dissolves with a mask, so there is no visible edge where
 * the image stops — only the page background showing through.
 *
 * **Mount this outside anything positioned or transformed.** It is `absolute`
 * with no positioned ancestor on purpose, which resolves it against the initial
 * containing block — the document's own origin — so its top edge is the top of
 * the window whatever chrome happens to be above it.
 *
 * That is the fix for a band this used to leave along the top. It was mounted
 * inside the hero, and pulled up by a fixed number of pixels chosen to clear
 * the header. The number could only ever be right for one page: a title page
 * has the sticky back row above it as well, so the artwork started some sixty
 * pixels down and the strip where the nav sits stayed page-coloured — a dark
 * slab in the dark theme, and a white one in the light. The profile page, with
 * no back row, needed a different number again. Against the containing block
 * there is no number to get wrong.
 */
export function TitleBackdrop({ backdrop }: { backdrop: string | null }) {
  const src = img.backdrop(backdrop, "w1280");
  if (!src) return null;

  return (
    <div
      aria-hidden
      // `w-screen` escapes the layout's max-width; the height runs from the top
      // of the window down to where the mask in `globals.css` has finished
      // dissolving it, which is what decides where the hero ends.
      //
      // `page-backdrop` is the marker the header keys off through `:has()`, so
      // its text picks up a shadow on exactly the pages where something is
      // painted behind it. See the block at the foot of `globals.css`.
      className="page-backdrop pointer-events-none absolute top-0 left-1/2 -z-10 h-[620px] w-screen -translate-x-1/2 sm:h-[680px]"
    >
      <div className="title-backdrop relative h-full w-full">
        <Image
          src={src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
        <div className="title-backdrop-fade absolute inset-0" />

        {/*
          The band the header sits in — faint, and taller than it looks like it
          needs to be so that it has nowhere to end visibly. The header's own
          text carries a shadow on these pages, which is what does most of the
          work; this only takes the glare off a bright frame. See the two
          together at the foot of `globals.css`.
        */}
        <div className="title-backdrop-crown absolute inset-x-0 top-0 h-56" />
      </div>
    </div>
  );
}
