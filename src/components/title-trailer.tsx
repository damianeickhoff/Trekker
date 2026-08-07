"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The trailer, played in the page rather than behind a button.
 *
 * It was a control in the action row that opened a full-screen dialog. That put
 * a trailer on the same footing as "I have watched this" — a decision to make
 * about the film — when it is really just more of the page, like the cast or the
 * reviews. Sitting below them it is there if the scroll reaches it and out of
 * the way if it does not.
 *
 * At rest it is a still and one play button, ours. An embedded player brings its
 * own title, channel avatar, share and watch-later controls to a page that has
 * already said what the film is twice — so YouTube is not asked for anything
 * until the button is pressed. That also means nothing is loaded from YouTube,
 * and no cookie of theirs is set, for a trailer nobody plays.
 */
export function TitleTrailer({ videoKey, title }: { videoKey: string; title: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  /**
   * Fullscreen has to be asked for inside the click that started playback — it
   * is gated on a user gesture, and a request made after the player has mounted
   * is no longer part of one. So the frame goes fullscreen first and the iframe
   * mounts into it.
   *
   * Not every browser will. iOS Safari has no Fullscreen API for anything but a
   * `<video>`, and an iframe is not one — there the trailer plays inline and its
   * own fullscreen control is the way out. Nothing here depends on the request
   * succeeding, so it is asked for and forgotten.
   */
  function play() {
    setPlaying(true);
    void frame.current?.requestFullscreen?.().catch(() => {});
  }

  /**
   * Leaving fullscreen stops the trailer, by taking the player away entirely.
   *
   * Pausing it would mean talking to YouTube's iframe API, which is a script
   * from them on every title page for the sake of one message — and the thing
   * actually being asked for is that a trailer does not carry on playing at you
   * from a page you have gone back to reading. Unmounting does that, and returns
   * the still and its play button, which is where this started.
   */
  useEffect(() => {
    if (!playing) return;

    const onChange = () => {
      if (!document.fullscreenElement) setPlaying(false);
    };

    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [playing]);

  /** `maxres` is the only 16:9 still, and the only one that might not exist. */
  const [still, setStill] = useState(
    `https://i.ytimg.com/vi/${videoKey}/maxresdefault.jpg`,
  );

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Trailer</h2>

      {/* A 16:9 box the player fills. `object-fit` has no meaning for an iframe,
          so the frame has to be the right shape rather than the video. */}
      <div
        ref={frame}
        className="trailer-frame card relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl"
      >
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
            title={`${title} trailer`}
            allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={play}
            aria-label={`Play the ${title} trailer`}
            className="group absolute inset-0 grid place-items-center"
          >
            <Image
              src={still}
              alt=""
              fill
              sizes="(min-width: 640px) 768px, 100vw"
              // 4:3 with letterboxing baked in, so it is cropped back to the
              // shape it was before YouTube padded it.
              onError={() =>
                setStill(`https://i.ytimg.com/vi/${videoKey}/hqdefault.jpg`)
              }
              className="object-cover opacity-80 transition group-hover:opacity-100"
            />

            <span className="relative grid h-16 w-16 place-items-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg shadow-black/50 backdrop-blur-md transition group-hover:scale-105 group-hover:bg-black/60">
              {/* Nudged right by the width of its own optical centre: a triangle
                  centred by its bounding box always looks a little left. */}
              <Play size={26} fill="currentColor" className="ml-1" />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
