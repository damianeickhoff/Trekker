import Image from "next/image";
import { img } from "@/lib/tmdb";

/**
 * Full-bleed artwork behind the top of a title page. It reaches up under the
 * sticky header and dissolves with a mask, so there is no visible edge where
 * the image stops — only the page background showing through.
 */
export function TitleBackdrop({ backdrop }: { backdrop: string | null }) {
  const src = img.backdrop(backdrop, "w1280");
  if (!src) return null;

  return (
    <div
      aria-hidden
      // -top-20/-top-24 pulls it up behind the sticky header and the main
      // element's own top padding; w-screen escapes the max-width container.
      className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-[420px] w-screen -translate-x-1/2 sm:-top-24 sm:h-[560px]"
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
      </div>
    </div>
  );
}
