"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type Slide = { id: number; title: string; backdrop: string; year: string | null };

/** Slow crossfading wall of popular movies behind the sign-in form. */
export function AuthBackdrop({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), 7000);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {slides.map((slide, i) => (
        <Image
          key={slide.id}
          src={`https://image.tmdb.org/t/p/w1280${slide.backdrop}`}
          alt=""
          fill
          priority={i === 0}
          // Every slide is on screen from the start, so eager-load them all:
          // a lazy slide would pop in halfway through its own crossfade.
          loading="eager"
          sizes="100vw"
          className={`object-cover transition-opacity duration-[2500ms] ease-in-out ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* Keep the form readable without hiding the artwork. Light mode needs a
          heavier veil, since the text on top of it is dark. */}
      <div className="auth-veil absolute inset-0" />
      <div className="bg-radial-fade absolute inset-0" />

      {/* The caption crossfades on the same curve as the artwork, so the two
          changes read as one. */}
      <div className="absolute inset-x-0 bottom-4 hidden text-center text-[11px] sm:block">
        {slides.map((slide, i) => (
          <p
            key={slide.id}
            className={`absolute inset-x-0 transition-opacity duration-[2500ms] ease-in-out ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="text-ink-300">{slide.title}</span>
            <span className="text-ink-400">{slide.year ? ` · ${slide.year}` : ""}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
