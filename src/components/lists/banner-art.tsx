"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "../title/hero-settle.module.css";

/**
 * The list page's banner: its first four posters side by side, blurred. Like
 * a title's backdrop it settles from 1.04 to 1 as it arrives
 * (`hero-settle.module.css`), once per page, and only when all four have
 * loaded, so the four move as one picture; until then it rests at the opening
 * frame. `next/image` reports a poster that loaded before hydration on mount,
 * so a cached banner settles straight away.
 */
export function BannerArt({ posters }: { posters: string[] }) {
  const [loaded, setLoaded] = useState(0);
  return (
    <span
      data-loaded={loaded >= posters.length ? "" : undefined}
      className={`${styles.settle} absolute inset-0 grid grid-cols-4 opacity-55 blur-[18px] saturate-[1.4]`}
    >
      {posters.map((poster, i) => (
        // TMDB's small size, straight from its CDN: blurred this much, more pixels are wasted bytes.
        <Image
          key={i}
          unoptimized
          src={`https://image.tmdb.org/t/p/w154/${poster.replace(/^\//, "")}`}
          alt=""
          width={154}
          height={231}
          onLoad={() => setLoaded((n) => n + 1)}
          className="size-full object-cover"
        />
      ))}
    </span>
  );
}
