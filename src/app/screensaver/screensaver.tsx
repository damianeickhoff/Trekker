"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Watching } from "@/lib/now-playing";
import type { Slide } from "@/lib/screensaver";
import styles from "./screensaver.module.css";

/*
 * The screensaver's moving parts: the artwork one title at a time, the
 * clock, and the Plex card. Everything else arrived with the page.
 */

/** Each title's time on screen. */
const SLIDE_MS = 20_000;
/** The press that opened it must not be the press that closes it. */
const DEAF_MS = 800;
/** A mouse set down or nudged is not someone wanting the screen back; a real move is. */
const MOVE_PX = 24;
/** Now-playing, only while visible and only with Plex linked (rebuild plan, section 8). */
const PLAYING_MS = 20_000;
/** Weather, Up next and the titles themselves are read again this often. */
const REREAD_MS = 30 * 60_000;

const backdropSrc = (path: string) => `https://image.tmdb.org/t/p/w1280/${path.replace(/^\//, "")}`;
const posterSrc = (path: string) => `https://image.tmdb.org/t/p/w92/${path.replace(/^\//, "")}`;

export type UpNextLine = { title: string; code: string; episode: string | null };

export function Screensaver({
  slides,
  upNext,
  weather,
  from,
  plexLinked,
}: {
  slides: Slide[];
  upNext: UpNextLine | null;
  weather: string | null;
  from: string;
  plexLinked: boolean;
}) {
  const router = useRouter();

  // Any input wakes it: a key, a press, a touch, the wheel, or the pointer
  // actually moving. Back to the page it started over.
  useEffect(() => {
    const opened = Date.now();
    let gone = false;
    let origin: { x: number; y: number } | null = null;
    const wake = () => {
      if (gone || Date.now() - opened < DEAF_MS) return;
      gone = true;
      router.replace(from);
    };
    const onMove = (e: PointerEvent) => {
      if (!origin) origin = { x: e.clientX, y: e.clientY };
      else if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > MOVE_PX) wake();
    };
    const events = ["keydown", "pointerdown", "touchstart", "wheel"] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, wake);
      window.removeEventListener("pointermove", onMove);
    };
  }, [from, router]);

  // Keep the screen on while this is showing, where the browser allows it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => undefined);
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), REREAD_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className={styles.root} role="dialog" aria-label="Screensaver. Press any key to return.">
      <Artwork slides={slides} />
      <span className={styles.scrim} aria-hidden="true" />
      <Queue slides={slides} />
      <div className={styles.stack}>
        <Clock weather={weather} />
        {upNext && (
          <div className={styles.next}>
            <span className={`${styles.label} ${styles.nextLabel}`}>Up next for you</span>
            <span className={styles.nextTitle}>
              {upNext.title} · {upNext.code}
              {upNext.episode && <span className={styles.episodeName}> · {upNext.episode}</span>}
            </span>
          </div>
        )}
        {plexLinked && <NowPlaying />}
      </div>
    </div>
  );
}

/**
 * Two layers: one showing, one loading the next title out of sight. The
 * swap waits for the next picture to arrive, so the crossfade never fades
 * into a half-drawn frame, and only two backdrops are ever held at once.
 */
function Artwork({ slides }: { slides: Slide[] }) {
  const [layers, setLayers] = useState<[number, number | null]>([0, null]);
  const [front, setFront] = useState<0 | 1>(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = window.setTimeout(() => {
      setLayers((current) => {
        const next: [number, number | null] = [...current];
        next[front === 0 ? 1 : 0] = ((current[front] ?? 0) + 1) % count;
        return next;
      });
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [front, count]);

  if (count === 0) return null;
  return (
    <>
      {layers.map((index, layer) => {
        if (index === null) return null;
        const slide = slides[index % count];
        return (
          <Image
            key={layer}
            unoptimized
            src={backdropSrc(slide.backdrop)}
            alt=""
            width={1280}
            height={720}
            priority={layer === 0}
            onLoad={() => layer !== front && setFront(layer as 0 | 1)}
            className={`${styles.art} ${layer === front ? styles.shown : ""}`}
          />
        );
      })}
    </>
  );
}

/** The next three titles, on a desktop, in the order they will come. */
function Queue({ slides }: { slides: Slide[] }) {
  const upcoming = slides.slice(1, 4).filter((s) => s.poster);
  if (upcoming.length === 0) return null;
  return (
    <div className={styles.queue} aria-hidden="true">
      {upcoming.map((s) => (
        <Image key={s.key} unoptimized src={posterSrc(s.poster!)} alt="" width={44} height={66} />
      ))}
    </div>
  );
}

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/**
 * Drawn only once the browser has the time: a clock is the one thing that
 * cannot arrive wrong from the server and correct itself a moment later.
 * Wakes on the minute rather than every second.
 */
function Clock({ weather }: { weather: string | null }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={styles.clock}>
      <span className={styles.time}>{now ? TIME.format(now) : " "}</span>
      <span className={styles.date}>{now ? [DATE.format(now), weather].filter(Boolean).join(" · ") : " "}</span>
    </div>
  );
}

/** Whoever in the house is watching something on Plex; nothing at all when nobody is. */
function NowPlaying() {
  const [watching, setWatching] = useState<Watching | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { watching: Watching[] | null };
        if (live.current) setWatching(data.watching?.[0] ?? null);
      } catch {
        // The server asleep or the network gone: the card keeps what it had.
      }
    };
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, PLAYING_MS);
    return () => {
      live.current = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  if (!watching) return null;
  return (
    <div className={styles.playing}>
      {watching.poster ? (
        <Image unoptimized src={posterSrc(watching.poster)} alt="" width={40} height={60} className={styles.playingPoster} />
      ) : (
        <span className={styles.playingPoster} aria-hidden="true" />
      )}
      <span className={styles.playingText}>
        <span className={`${styles.label} ${styles.playingWho}`}>
          {watching.who} is watching{watching.player ? ` · ${watching.player}` : ""}
        </span>
        <span className={styles.playingTitle}>{[watching.title, watching.code].filter(Boolean).join(" · ")}</span>
        <span className={styles.bar}>
          <span className={styles.barFill} style={{ width: `${watching.progress}%`, display: "block" }} />
        </span>
      </span>
    </div>
  );
}
