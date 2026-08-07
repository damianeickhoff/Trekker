import Image from "next/image";
import { img } from "@/lib/images";

/**
 * A wash behind a person, made from the posters of what they are known for.
 *
 * A person has no artwork of their own — TMDB gives a portrait on a grey
 * studio background and nothing else — so the page had nothing behind it and
 * looked like a database record. What they have instead is a body of work, and
 * the colours of that work say something true about them: a horror career and a
 * run of romantic comedies do not look alike.
 *
 * Three posters rather than one. One is a poster with a blur on it and reads as
 * a mistake; three overlapping at low opacity stop being pictures and become a
 * colour field, which is the point. They are laid across the top and masked out
 * downwards so the page's own background takes over before any text reaches it.
 */
export function PersonBackdrop({ posters }: { posters: (string | null)[] }) {
  const usable = posters.filter((path): path is string => Boolean(path)).slice(0, 3);
  if (usable.length === 0) return null;

  return (
    <div
      aria-hidden
      // Pulled up behind the sticky nav and the page's own top padding, so the
      // colour starts at the top of the window rather than in a band below it.
      className="person-backdrop pointer-events-none absolute -top-20 left-1/2 -z-10 h-[420px] w-screen -translate-x-1/2 overflow-hidden sm:-top-24 sm:h-[480px]"
    >
      <div className="flex h-full w-full">
        {usable.map((path, index) => (
          <div key={path} className="relative h-full flex-1">
            <Image
              src={img.poster(path, "w342")!}
              alt=""
              fill
              sizes="50vw"
              priority={index === 0}
              // Scaled past its own box because a blur this wide samples beyond
              // the edges and would otherwise leave seams between the three.
              className="scale-125 object-cover blur-3xl saturate-150"
            />
          </div>
        ))}
      </div>

      <div className="person-backdrop-fade absolute inset-0" />
    </div>
  );
}
