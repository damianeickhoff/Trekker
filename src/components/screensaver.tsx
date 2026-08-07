"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Pause,
  Star,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatSpan } from "@/lib/format";
import type { PlexSession } from "@/lib/plex";
import type { Slide } from "@/lib/screensaver";
import type { Weather, WeatherKind } from "@/lib/weather";

/**
 * The screensaver.
 *
 * Everything else in this app is read by somebody holding the device. This is
 * read from the sofa, or from the doorway, by somebody who did not ask for it —
 * so it is built to different rules. Nothing is smaller than it has to be,
 * nothing needs to be tapped, nothing is the app's violet: the page is a
 * photograph somebody else lit, and white on black is the only treatment that
 * survives an arbitrary one of those.
 *
 * The four things on it, in the order they earn their place:
 *
 *   The artwork.   A film at a time, drifting, crossfading, with its own
 *                  lettering where TMDB has it.
 *   The time.      The one fact anybody walking past actually wants.
 *   The weather.   The second, and only when a place has been set.
 *   Who is on.     Whoever in the house has something playing on Plex, which is
 *                  the fact this app has that a photo frame does not.
 *
 * It leaves the moment anything happens — a key, a tap, a mouse that actually
 * travels — and lands back on whatever page sent it here.
 */

/**
 * How long one slide holds the screen.
 *
 * Sixteen seconds is longer than it sounds and deliberately so. There is
 * nothing counting it down any more, and without a bar draining in the corner
 * the right pace is the one at which the next picture is a small surprise
 * rather than something you were waiting for.
 */
const HOLD = 16_000;
/** The text goes this far ahead of the picture, so the two never dissolve at once. */
const LEAVE = 900;
/** How long a picture takes to cross. Long, because it is the only cut there is. */
const FADE = 2000;
/**
 * Input is ignored for this long after arriving — insurance against the press
 * that opened the screensaver being counted as the press that closes it.
 */
const ARM = 800;
/** How often the whole run is rebuilt, for a display that is never turned off. */
const REBUILD = 30 * 60 * 1000;
/** The Plex poll. Slower than the dashboard's: nobody is waiting on this one. */
const SESSIONS = 20_000;

export function Screensaver({
  slides: initialSlides,
  weather: initialWeather,
  plexLinked,
  exitTo,
}: {
  slides: Slide[];
  weather: Weather | null;
  /** Whether there is a Plex identity worth polling for. */
  plexLinked: boolean;
  /** Where the reader was when this started, and where they go back to. */
  exitTo: string;
}) {
  const router = useRouter();
  const [showcase, setShowcase] = useState({
    slides: initialSlides,
    weather: initialWeather,
  });
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [sessions, setSessions] = useState<PlexSession[]>([]);
  /** When the way out was last written on the screen. See below. */
  const [hint, setHint] = useState(0);

  const { slides, weather } = showcase;
  const count = slides.length;
  const slide = count > 0 ? slides[index % count] : null;

  /* -- Leaving ------------------------------------------------------------ */

  const wake = useCallback(() => {
    // Handing the window back before navigating: a page that is not a
    // screensaver has no business still being the whole screen.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    router.push(exitTo);
  }, [router, exitTo]);

  /**
   * It closes when it is told to, not when somebody walks past the desk.
   *
   * Escape, or a deliberate press on the screen. Nothing else — and in
   * particular not a moving mouse, which is what a desktop screensaver
   * traditionally watches for and is exactly wrong here: this is a thing you
   * put on a screen *to be looked at*, often on a machine that is still doing
   * something else, and having it collapse because the cursor drifted a
   * centimetre makes it unusable as either.
   *
   * A press stays, despite the same argument applying to it, because there is
   * no Escape key on a tablet and that tablet is the device this is for. It
   * takes an intent that a cursor crossing the screen never had.
   */
  useEffect(() => {
    let armed = false;

    const arming = setTimeout(() => {
      armed = true;
    }, ARM);

    /** Once. Two events can land in the same frame, and a navigation pushed
        twice is an entry somebody has to press back through. */
    function leave() {
      if (!armed) return;
      armed = false;
      wake();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") leave();
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", leave);

    return () => {
      clearTimeout(arming);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", leave);
    };
  }, [wake]);

  /**
   * A moved mouse no longer closes it, so it has to do *something*.
   *
   * Moving the mouse is the universal way of asking a screensaver a question,
   * and the question is "how do I get out of this" — so that is what it answers.
   * The line at the foot of the screen comes back for a few seconds and goes
   * again, which is the whole of the interaction: nothing is lost by asking, and
   * nothing is left on the artwork afterwards.
   *
   * Throttled to the length of its own animation. Without that, a mouse crossing
   * the desk restarts the fade on every frame and the hint never gets past its
   * first opacity step.
   */
  useEffect(() => {
    let last = Date.now();

    function onMove() {
      const now = Date.now();
      if (now - last < 8000) return;
      last = now;
      setHint(now);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  /* -- Keeping the screen on ---------------------------------------------- */

  /**
   * A screensaver that lets the display sleep is a black rectangle, which is
   * what the operating system was going to do anyway. Best effort in every
   * sense: the API is not everywhere, it needs a secure context, and a browser
   * may simply refuse — all of which mean the same thing here, which is that
   * the device's own timeout wins.
   */
  useEffect(() => {
    type Sentinel = { release(): Promise<void> };
    const api = (
      navigator as Navigator & {
        wakeLock?: { request(type: "screen"): Promise<Sentinel> };
      }
    ).wakeLock;
    if (!api) return;

    let sentinel: Sentinel | null = null;
    let dropped = false;

    async function hold() {
      try {
        const next = await api!.request("screen");
        if (dropped) void next.release().catch(() => {});
        else sentinel = next;
      } catch {
        // Refused, or not allowed here. Nothing to do and nothing to say.
      }
    }

    void hold();

    // The lock is released for us whenever the tab is hidden, so it has to be
    // taken again when the tab comes back — otherwise switching away once
    // silently ends it for the rest of the night.
    function onVisible() {
      if (document.visibilityState === "visible" && !sentinel) void hold();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);

  /* -- The slideshow ------------------------------------------------------ */

  /**
   * One slide's life, scheduled when it arrives.
   *
   * Two timers rather than one, because the text and the picture do not change
   * together: the words go first and the photograph follows them nearly a
   * second later, so the two crossfades never overlap. Both changes are made
   * from inside a timer — the effect itself sets nothing, which is what keeps
   * this a subscription to a clock rather than a render that causes a render.
   */
  useEffect(() => {
    if (count < 2) return;

    const out = setTimeout(() => setLeaving(true), HOLD - LEAVE);
    const advance = setTimeout(() => {
      setLeaving(false);
      setIndex((i) => (i + 1) % count);
    }, HOLD);

    return () => {
      clearTimeout(out);
      clearTimeout(advance);
    };
  }, [index, count]);

  /**
   * The one after next, fetched into the browser cache before it is needed.
   *
   * Only the three slides around the current one are in the document — twelve
   * full-width photographs decoded at once is more than a tablet on a shelf can
   * comfortably hold — so without this the layer that is about to fade in is
   * still downloading when its fade starts.
   */
  useEffect(() => {
    if (count < 2) return;
    const ahead = slides[(index + 2) % count];
    if (ahead) new window.Image().src = ahead.backdrop;
  }, [index, count, slides]);

  /* -- What the house is watching ----------------------------------------- */

  useEffect(() => {
    if (!plexLinked) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/plex/now-playing", { cache: "no-store" });
        const data = (await res.json()) as { friends?: PlexSession[] };
        if (!cancelled) setSessions(data.friends ?? []);
      } catch {
        if (!cancelled) setSessions([]);
      }
    }

    void poll();
    const timer = setInterval(poll, SESSIONS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [plexLinked]);

  /**
   * Rebuilt every half hour, because the thing this runs on is a screen that is
   * never turned off. Without it, a tablet left on a shelf on Monday is still
   * showing Monday's trending list, and Monday's temperature, on Thursday.
   */
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/screensaver", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { slides?: Slide[]; weather?: Weather | null };
        // A refresh that came back empty is a network blip, not an instruction
        // to blank the screen.
        if (data.slides && data.slides.length > 0) {
          setShowcase({ slides: data.slides, weather: data.weather ?? null });
          setIndex(0);
        }
      } catch {
        // Keep showing what we have.
      }
    }, REBUILD);

    return () => clearInterval(timer);
  }, []);

  /* -- Drawing ------------------------------------------------------------ */

  const motion = leaving ? "ss-leave" : "ss-enter";

  return (
    <div className="screensaver fixed inset-0 z-[60] cursor-none overflow-hidden bg-black text-white select-none">
      <Stage slides={slides} index={index} />

      {/*
        The order of these five is the whole look, and none of them commutes.

        The blur comes first, because a `backdrop-filter` can only sample what
        has already been painted beneath it — put it after the veils and it
        would be blurring a gradient. Then the veils darken the now-soft bands,
        then the vignette closes the corners in, then the film's own colour is
        thrown back over all of it, and the grain goes last so it lies on the
        finished picture rather than being blurred along with it.
      */}
      <div className="ss-blur-top pointer-events-none absolute inset-x-0 top-0 h-[38%]" />
      <div className="ss-blur-bottom pointer-events-none absolute inset-x-0 bottom-0 h-[46%]" />

      <div className="ss-veil-top pointer-events-none absolute inset-x-0 top-0 h-2/5" />
      <div className="ss-veil-bottom pointer-events-none absolute inset-x-0 bottom-0 h-3/5" />
      <div className="ss-vignette pointer-events-none absolute inset-0" />

      <Bloom slides={slides} index={index} />

      {/* Under the text and over the artwork, so it unifies the pictures
          without sitting on top of anything that has to be read. */}
      <div className="ss-grain pointer-events-none absolute inset-0" />

      {/* The margin is the window's, scaled with it — a fixed inset that looks
          generous on a laptop is a hairline on a television. The `max()` against
          the safe area is what keeps the clock out from under a notch and the
          synopsis off the home indicator on the tablet this is really for. */}
      <div className="relative flex h-full flex-col justify-between pt-[max(clamp(1.5rem,4vw,4rem),calc(env(safe-area-inset-top)+0.75rem))] pr-[max(clamp(1.5rem,4vw,4rem),env(safe-area-inset-right))] pb-[max(clamp(2rem,5vw,4.5rem),calc(env(safe-area-inset-bottom)+1.5rem))] pl-[max(clamp(1.5rem,4vw,4rem),env(safe-area-inset-left))]">
        <div className="flex items-start justify-between gap-8">
          <Clock />
          {weather && <WeatherPanel weather={weather} />}
        </div>

        <div className="flex items-end justify-between gap-10">
          {slide ? (
            // Keyed, so every slide gets its own mount and with it a fresh run
            // of the entrance animation.
            <TitleBlock key={`${slide.mediaType}-${slide.id}`} slide={slide} motion={motion} />
          ) : (
            <p className="ss-enter max-w-md text-sm text-white/50">
              No artwork to show yet — add a TMDB key, or pick a different source in
              settings.
            </p>
          )}

          <Watching sessions={sessions} />
        </div>
      </div>

      {/* Where the way out is written down. It says its piece and goes — a
          permanent caption over film artwork is a watermark — and comes back
          whenever somebody moves the mouse to ask. Keyed on when that was, which
          is what restarts the animation. */}
      <div
        key={hint}
        className="ss-hint pointer-events-none absolute inset-x-0 bottom-[clamp(0.75rem,2vw,1.5rem)] flex items-center justify-center gap-2 text-[11px] tracking-[0.22em] text-white uppercase"
      >
        <kbd className="rounded-[5px] border border-white/35 px-1.5 py-0.5 font-sans text-[10px] leading-none tracking-[0.1em]">
          Esc
        </kbd>
        <span>or tap to exit</span>
      </div>
    </div>
  );
}

/* ==========================================================================
 * The artwork
 * ======================================================================== */

/**
 * The picture, and the picture either side of it.
 *
 * Every layer is mounted at once and switched with opacity, so a crossfade is
 * two composited layers rather than an image being swapped in a single element
 * — which is what stops the flash of nothing at the moment of the change. Only
 * three of them exist at a time, though: the one going, the one here and the one
 * coming.
 *
 * The pan class stays on the outgoing layer for the whole of its fade. Taking it
 * off the instant the index moves would snap that layer back to its untransformed
 * position while it is still fully visible, which reads as the picture jumping
 * just before it leaves.
 */
/**
 * Which slides exist in the document at any moment: the one going, the one
 * here, and the one coming. Shared by the artwork and the glow, because the two
 * have to mount, fade and unmount on exactly the same schedule — a colour that
 * outlived its picture by a frame would be visible as a flash of the wrong film.
 */
function near(index: number, count: number) {
  const previous = (index - 1 + count) % count;
  const next = (index + 1) % count;
  return (i: number) => i === index || i === previous || i === next;
}

function Stage({ slides, index }: { slides: Slide[]; index: number }) {
  const count = slides.length;

  // Not a blank screen: a field of the app's own colour, so a screensaver with
  // no artwork behind it still looks like something that was designed.
  if (count === 0) return <div className="ss-empty absolute inset-0" />;

  const previous = (index - 1 + count) % count;
  const mounted = near(index, count);

  return (
    <div className="absolute inset-0">
      {slides.map((slide, i) => {
        if (!mounted(i)) return null;

        const active = i === index;
        const moving = active || i === previous;

        return (
          <div
            // A film and a show can share a TMDB id, so neither half of this is
            // a key on its own.
            key={`${slide.mediaType}-${slide.id}`}
            aria-hidden={!active}
            // The focus pull hangs off this element rather than the panning one
            // inside it, because that one's `animation` is already spoken for —
            // and because a `filter` and a `transform` on the same node fight
            // over the same composited layer.
            className={`absolute inset-0 transition-opacity ease-[cubic-bezier(0.4,0,0.2,1)] ${
              active ? "ss-focus" : ""
            }`}
            style={{ opacity: active ? 1 : 0, transitionDuration: `${FADE}ms` }}
          >
            <div
              className={`absolute inset-0 ${
                moving ? (i % 2 === 0 ? "ss-pan" : "ss-pan-out") : ""
              }`}
            >
              {/* All three are wanted within the next fifteen seconds, so none
                  of them has anything to gain by being lazy. */}
              <Image
                src={slide.backdrop}
                alt=""
                fill
                sizes="100vw"
                className="object-cover"
                priority
                unoptimized
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The colour of the room.
 *
 * A glow rising out of the bottom-left corner in whatever colour the bottom of
 * the current frame averages to, and a fainter one falling from the opposite
 * corner — screen-blended, so it can only add light. It is the difference
 * between a photograph on a black page and a photograph lighting the wall
 * behind it, and it costs two gradients.
 *
 * Mounted and faded on exactly the same schedule as the artwork, on the layer
 * above the veils: below them the vignette and the bottom wash would have taken
 * nine tenths of it back out again, which is where the colour is most wanted.
 *
 * A slide whose artwork could not be sampled simply has no layer here.
 */
function Bloom({ slides, index }: { slides: Slide[]; index: number }) {
  const count = slides.length;
  if (count === 0) return null;

  const mounted = near(index, count);

  return (
    <div className="pointer-events-none absolute inset-0">
      {slides.map((slide, i) => {
        if (!slide.bloom || !mounted(i)) return null;

        return (
          <div
            key={`${slide.mediaType}-${slide.id}`}
            className="ss-bloom absolute inset-0 transition-opacity ease-[cubic-bezier(0.4,0,0.2,1)]"
            style={{
              opacity: i === index ? 1 : 0,
              transitionDuration: `${FADE}ms`,
              // Both centres sit just off the screen, so what is on it is the
              // shoulder of the glow rather than its hotspot — a visible centre
              // reads as a lamp behind the page.
              backgroundImage: [
                `radial-gradient(75% 62% at 6% 110%, rgb(${slide.bloom} / 0.5) 0%, transparent 68%)`,
                `radial-gradient(62% 48% at 96% -10%, rgb(${slide.bloom} / 0.28) 0%, transparent 70%)`,
              ].join(","),
            }}
          />
        );
      })}
    </div>
  );
}

/* ==========================================================================
 * The time
 * ======================================================================== */

/**
 * Rendered only once the browser has it.
 *
 * The server's clock is not the reader's, and a time is the one thing on a page
 * that cannot be allowed to arrive wrong and correct itself — so nothing is
 * drawn until the first effect runs, and what appears then fades in like
 * everything else. It also sidesteps the hydration mismatch entirely.
 *
 * The tick is aligned to the wall clock rather than set to a plain sixty second
 * interval, so 21:47 becomes 21:48 when the minute turns and not up to a minute
 * afterwards.
 */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function schedule() {
      setNow(new Date());
      // A hair past the turn, so rounding can never land on the minute before.
      timer = setTimeout(schedule, 60_000 - (Date.now() % 60_000) + 60);
    }

    schedule();
    return () => clearTimeout(timer);
  }, []);

  if (!now) return <div className="h-[clamp(4rem,10vw,9rem)]" />;

  // The reader's own convention, rather than the app's: a screensaver showing
  // 21:47 to somebody whose every other clock says 9:47 pm is showing the time
  // in a foreign language. Built by hand rather than from a formatted string
  // because the colon has to be an element of its own.
  const hour12 =
    new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ??
    false;
  const raw = now.getHours();
  const hours = hour12 ? String(raw % 12 || 12) : String(raw).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return (
    <div className="ss-enter">
      {/* Each field is keyed on its own value, so changing minute rises into
          place on its own and the hour beside it does not move for the other
          fifty-nine. */}
      <p className="flex items-baseline text-[clamp(3.5rem,8.5vw,9rem)] leading-[0.85] font-extralight tracking-[-0.045em] tabular-nums drop-shadow-[0_2px_24px_rgb(0_0_0/0.5)]">
        {/* Prefixed, because at 11:11 the two fields hold the same string and
            two siblings cannot share a key. */}
        <span key={`h${hours}`} className="ss-tick">
          {hours}
        </span>
        <span key="colon" className="ss-colon px-[0.04em]">
          :
        </span>
        <span key={`m${minutes}`} className="ss-tick">
          {minutes}
        </span>
        {hour12 && (
          <span className="ml-[0.18em] text-[0.22em] font-light tracking-[0.2em] text-white/60 uppercase">
            {raw < 12 ? "am" : "pm"}
          </span>
        )}
      </p>
      <p
        className="ss-enter mt-[clamp(0.4rem,1vw,0.9rem)] text-[clamp(0.8rem,1.35vw,1.15rem)] font-light tracking-[0.16em] text-white/65 uppercase"
        style={{ "--ss-delay": "120ms" } as React.CSSProperties}
      >
        {now.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
    </div>
  );
}

/* ==========================================================================
 * The weather
 * ======================================================================== */

const GLYPHS: Record<WeatherKind, typeof Sun> = {
  clear: Sun,
  "part-cloud": CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

function WeatherPanel({ weather }: { weather: Weather }) {
  // The one exception to the icon table: a clear night is a moon, not a sun.
  const Glyph = weather.kind === "clear" && !weather.isDay ? Moon : GLYPHS[weather.kind];

  /**
   * Two lines, not four.
   *
   * It began as a widget: a temperature, a condition, a place and a high/low
   * pair, each on its own line, right-aligned opposite the clock — and four
   * stacked lines of small type is the visual weight of a paragraph, which put
   * it in competition with the one number up here that anybody actually looks
   * for. The high and the low are the first to go; they are a forecast, and
   * nobody standing in a hallway is planning their day off a screensaver. What
   * is left is what you would say out loud: fourteen degrees, overcast, at home.
   */
  return (
    <div
      className="ss-enter flex items-center gap-[clamp(0.6rem,1.3vw,1.15rem)] text-right"
      style={{ "--ss-delay": "220ms" } as React.CSSProperties}
    >
      <div>
        <p className="text-[clamp(1.5rem,2.8vw,2.75rem)] leading-none font-extralight tracking-[-0.03em] tabular-nums">
          {weather.temperature}
          <span className="align-top text-[0.42em] text-white/60">°{weather.unit}</span>
        </p>
        <p className="mt-2 text-[clamp(0.65rem,0.95vw,0.85rem)] tracking-[0.12em] text-white/50 uppercase">
          {weather.label} · {weather.place}
        </p>
      </div>

      {/* Sized off the type rather than in pixels, so the panel scales with the
          window the same way the clock opposite it does. */}
      <Glyph
        strokeWidth={1.25}
        className="h-[clamp(1.75rem,3vw,2.75rem)] w-[clamp(1.75rem,3vw,2.75rem)] shrink-0 text-white/80 drop-shadow-[0_2px_16px_rgb(0_0_0/0.5)]"
      />
    </div>
  );
}

/* ==========================================================================
 * The title
 * ======================================================================== */

function TitleBlock({ slide, motion }: { slide: Slide; motion: string }) {
  const facts = [
    slide.year,
    ...slide.genres,
    slide.seasons
      ? `${slide.seasons} ${slide.seasons === 1 ? "season" : "seasons"}`
      : slide.runtime
        ? formatSpan(slide.runtime)
        : null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="min-w-0 max-w-[min(46rem,62vw)]">
      {/*
        The eyebrow: what kind of thing this is, and a rule that draws itself
        out from it.

        "Film" and "Series" used to be the first item in the row of facts below,
        between the score and the year, which is where the least interesting
        fact on the slide had the most prominent position in the list. Up here it
        does a second job instead — it gives the block a fixed top edge. A title
        treatment is artwork of whatever height TMDB happens to hold, so without
        something above it the corner starts somewhere different on every slide,
        and a slideshow whose furniture moves is a slideshow you keep re-reading.
      */}
      <div
        className={`${motion} flex items-center gap-3`}
        style={{ "--ss-delay": "60ms" } as React.CSSProperties}
      >
        <span className="text-[clamp(0.6rem,0.85vw,0.75rem)] font-medium tracking-[0.32em] text-white/55 uppercase">
          {slide.mediaType === "tv" ? "Series" : "Film"}
        </span>
        <span
          aria-hidden
          className="ss-rule h-px w-[clamp(2.5rem,6vw,6rem)] bg-gradient-to-r from-white/45 to-transparent"
          style={{ "--ss-delay": "260ms" } as React.CSSProperties}
        />
      </div>

      {/* The lettering, where the film has its own. The heading stays in the
          markup underneath either way — a title treatment is a picture, and a
          picture is not a heading to anything that is not looking at it. */}
      <div className={`${motion} mt-[clamp(0.6rem,1.2vw,1.1rem)]`}>
        {slide.logo ? (
          <>
            <Image
              src={slide.logo}
              alt=""
              aria-hidden
              // Sized from the height, with the ratio TMDB reports supplying the
              // width — the same reasoning as the title page's hero: a wide
              // wordmark and a tall stacked lockup both have to land at a
              // sensible size without either of them being measured.
              width={Math.round(160 * (slide.logoRatio ?? 2))}
              height={160}
              priority
              unoptimized
              className="ss-logo h-auto max-h-[clamp(3.5rem,11vh,8rem)] w-auto max-w-full object-contain object-left"
            />
            <h1 className="sr-only">{slide.title}</h1>
          </>
        ) : (
          <h1 className="text-[clamp(2rem,4.6vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance drop-shadow-[0_2px_20px_rgb(0_0_0/0.6)]">
            {slide.title}
          </h1>
        )}
      </div>

      {/* The facts, flush left under the lettering, with the score last. It led
          this row as a chip and pushed the year and the genres off the left
          margin the logo above them is aligned to — so the block had two left
          edges. */}
      <div
        className={`${motion} mt-[clamp(0.75rem,1.6vw,1.5rem)] flex flex-wrap items-center gap-x-3 gap-y-2 text-[clamp(0.7rem,1.05vw,0.9rem)] tracking-[0.12em] text-white/70 uppercase`}
        style={{ "--ss-delay": "140ms" } as React.CSSProperties}
      >
        {facts.map((fact, i) => (
          <span key={`${fact}-${i}`} className="inline-flex items-center gap-3">
            {i > 0 && <span className="text-white/25">·</span>}
            {fact}
          </span>
        ))}
        {slide.score > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 tracking-normal text-white backdrop-blur-md">
            <Star size={12} className="fill-current text-amber-300" />
            <span className="tabular-nums">{(slide.score / 10).toFixed(1)}</span>
          </span>
        )}
      </div>

      {/*
        The tagline where there is one, and the synopsis where there is not.
        A tagline is one line written to be read at a glance, which is exactly
        what this is; a synopsis is three paragraphs of plot, so it is clamped to
        two lines and never gets to push the artwork around.
      */}
      {(slide.tagline || slide.overview) && (
        <p
          className={`${motion} mt-[clamp(0.6rem,1.2vw,1.1rem)] line-clamp-2 max-w-[42rem] text-[clamp(0.85rem,1.25vw,1.15rem)] leading-relaxed text-white/60 ${
            slide.tagline ? "italic" : ""
          }`}
          style={{ "--ss-delay": "230ms" } as React.CSSProperties}
        >
          {slide.tagline ?? slide.overview}
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
 * Who is watching what
 * ======================================================================== */

/**
 * The one thing here a photo frame could not do.
 *
 * Only other people, never the reader — the endpoint behind it answers friends
 * only, for the reason it explains. On a screen in a hallway that is exactly
 * right: what is worth knowing at a glance is that somebody in the house has
 * something on, not that you do.
 */
function Watching({ sessions }: { sessions: PlexSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
      <p className="fade-in mb-0.5 text-[10px] tracking-[0.3em] text-white/40 uppercase">
        Watching now
      </p>

      {sessions.slice(0, 3).map((session) => (
        <div
          key={session.who?.id ?? session.title}
          className="fade-in flex items-center gap-3 rounded-2xl border border-white/12 bg-white/8 py-2 pr-2 pl-4 backdrop-blur-xl"
        >
          <div className="min-w-0 text-right">
            <p className="max-w-[15rem] truncate text-[clamp(0.75rem,1vw,0.9rem)] font-medium">
              {session.title}
            </p>
            <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-white/50">
              {session.paused && <Pause size={9} fill="currentColor" />}
              {session.who?.name ?? "Someone"} ·{" "}
              <span className="tabular-nums">{session.remaining}m left</span>
            </p>
          </div>

          <ProgressFace session={session} />
        </div>
      ))}
    </div>
  );
}

/**
 * A face with how far through they are drawn around it.
 *
 * The ring is the progress bar the dashboard's strip draws along its bottom
 * edge, curled around the avatar — at this size, on this screen, a 200px bar is
 * a smear, and a ring reads as a fraction from across a room.
 */
function ProgressFace({ session }: { session: PlexSession }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const done = Math.min(100, Math.max(0, session.progress)) / 100;

  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-10 w-10 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="2" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done)}
          className="text-white/85 transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>

      <span className="grid h-[30px] w-[30px] place-items-center overflow-hidden rounded-full bg-white/15 text-[11px] font-bold">
        {session.who?.avatar ? (
          <Image
            src={session.who.avatar}
            alt=""
            width={30}
            height={30}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          (session.who?.name ?? "?").slice(0, 1).toUpperCase()
        )}
      </span>
    </span>
  );
}
