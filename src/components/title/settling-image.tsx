"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import styles from "./hero-settle.module.css";

/**
 * A hero backdrop that settles once it has loaded (`hero-settle.module.css`).
 * `next/image` reports an image that finished before hydration as loaded on
 * mount, so a cached backdrop settles straight away rather than waiting.
 */
export function SettlingImage({ className = "", alt, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      {...props}
      alt={alt}
      data-loaded={loaded ? "" : undefined}
      onLoad={() => setLoaded(true)}
      className={`${styles.settle} ${className}`}
    />
  );
}
