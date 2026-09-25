import Image from "next/image";
import type { ReactNode } from "react";
import type { TitleLogo as Logo } from "@/lib/tmdb";
import { tmdbSrc } from "@/lib/tmdb-image-loader";
import { PosterPlaceholder } from "../poster";
import { SettlingImage } from "./settling-image";

/*
 * The pieces every title, episode, film and person hero shares. Heroes are
 * dark in both themes: the artwork blurred and saturated behind a scrim that
 * darkens towards the foot and meets the page's own background at the very
 * bottom, so the hero runs into the page instead of stopping at an edge. Text
 * on a hero is white.
 */

/**
 * The foot of every hero, where it turns into the page. Short and steep, and
 * from a near-opaque dark rather than from the translucent scrim: fading a
 * see-through black straight into the light theme's paper laid a pale veil
 * over the blurred artwork for a third of the hero, which read as a white
 * haze. Now the artwork is covered before the band starts, and the band is
 * only dark turning into the page colour. In dark the two ends are nearly the
 * same colour, so the band disappears.
 */
export const HERO_FADE = 120;

/**
 * The scrim over a hero's artwork. Above the band, the translucent night the
 * heroes always had, deepening to nearly opaque where the band starts. In the
 * band, night mixed with the page colour, eased so it stays dark for its first
 * half and turns quickly at the very foot: a straight line would put the
 * hero's lowest line of white type on mid-grey in the light theme.
 */
export function heroScrim() {
  const band = (from: number, bg: number) => `color-mix(in srgb, var(--bg) ${bg}%, #0b0c10) calc(100% - ${from}px)`;
  return [
    "linear-gradient(180deg",
    "rgba(11,12,16,0.3) 0%",
    `rgba(11,12,16,0.6) calc(100% - ${HERO_FADE * 2}px)`,
    `rgba(11,12,16,0.92) calc(100% - ${HERO_FADE}px)`,
    band(HERO_FADE / 2, 15),
    band(HERO_FADE / 5, 55),
    "var(--bg) 100%)",
  ].join(", ");
}

/**
 * The scrim for a band set into the middle of a page (Discover's groups): the
 * hero's own, with its foot mirrored at the top as well, so the band comes out
 * of the page colour and goes back into it rather than starting at an edge.
 * Whatever stands on it should keep clear of the first `HERO_FADE / 2`, where
 * the light theme's paper still shows through.
 */
export function bandScrim() {
  const band = (at: number, bg: number) => `color-mix(in srgb, var(--bg) ${bg}%, #0b0c10) ${at}px`;
  const head = [
    "linear-gradient(180deg",
    "var(--bg) 0px",
    band(HERO_FADE / 5, 55),
    band(HERO_FADE / 2, 15),
    `rgba(11,12,16,0.92) ${HERO_FADE}px`,
    `rgba(11,12,16,0) ${HERO_FADE * 2}px)`,
  ].join(", ");
  return `${head}, ${heroScrim()}`;
}

/**
 * The artwork behind a hero: TMDB's smallest backdrop, blurred, so the page
 * pays for one small image rather than a second full-size one. The same URL
 * whether the phone or desktop hero draws it, so the browser fetches it once.
 * Its opacity is the same in both themes, over the night colour, so the light
 * theme never draws it paler. `poster` is for a hero lit by a poster (the
 * profile's last thing watched): TMDB serves posters at w154, not w300.
 * On desktop it reaches past the content cap to the column's edges (`bleed`),
 * while whatever stands on it stays inside the cap.
 */
export function HeroArt({ path, poster = false }: { path: string | null; poster?: boolean }) {
  return (
    <span aria-hidden="true" className="hero-foot pointer-events-none absolute inset-0 overflow-hidden bg-night lg:bleed">
      {path && (
        <Image
          unoptimized
          src={`https://image.tmdb.org/t/p/${poster ? "w154" : "w300"}/${path.replace(/^\//, "")}`}
          alt=""
          width={300}
          height={169}
          className="absolute -left-[12%] -top-[12%] h-[124%] w-[124%] max-w-none object-cover object-[center_30%] opacity-85 blur-[44px] saturate-150"
        />
      )}
      <span
        className="absolute inset-0"
        style={{ background: heroScrim() }}
      />
    </span>
  );
}

/**
 * The title and episode pages' artwork where the title has a backdrop: TMDB's
 * w1280, sharp, as the picture the hero is about, under the same scrim as
 * `HeroArt` and with the same fade into the page. It replaces the blurred copy
 * rather than sitting on it, so the page pays for one image and paints one
 * layer. The phone and desktop heroes each carry one at the same URL, and only
 * one of them is ever displayed, so it downloads and decodes once.
 *
 * On phones a 16:9 frame cropped to the whole height of the hero would be a
 * narrow slice of its middle, so it keeps to the top and dissolves into the
 * night below, where the lettering stands. On desktop it fills the hero behind
 * the poster and details, and a wash from the left keeps the white type legible
 * over a bright frame. `children` go over the picture: on phones, the tick that
 * confirms a mark, which plays over the poster where there is one.
 */
export function BackdropArt({ path, children }: { path: string; children?: ReactNode }) {
  return (
    <span aria-hidden="true" className="hero-foot pointer-events-none absolute inset-0 overflow-hidden bg-night lg:bleed">
      {/* Settles from 1.04 once loaded, once per page; the scrims and lettering over it stay still. */}
      <SettlingImage
        unoptimized
        src={`https://image.tmdb.org/t/p/w1280/${path.replace(/^\//, "")}`}
        alt=""
        width={1280}
        height={720}
        priority
        className="absolute inset-x-0 top-0 h-[72%] w-full max-w-none object-cover object-[center_20%] [mask-image:linear-gradient(180deg,#000_55%,transparent)] lg:h-full lg:[mask-image:none]"
      />
      <span className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(11,12,16,0.6)_0%,rgba(11,12,16,0.3)_40%,rgba(11,12,16,0)_70%)] lg:block" />
      <span className="absolute inset-0" style={{ background: heroScrim() }} />
      {children}
    </span>
  );
}

/**
 * TMDB's own lettering for the title, capped so a wide treatment cannot push
 * the hero apart, with the typed title in its place when TMDB has none. The
 * heading either way, so the page has one name for assistive tech.
 */
export function TitleLogo({
  logo,
  title,
  size = "hero",
  className = "",
}: {
  logo: Logo | null;
  title: string;
  /**
   * `hero`: 260px wide on phones, 420px on desktop. `large`: the phone's
   * backdrop hero, where the lettering is the subject and no poster stands
   * over it: 1.6 times the hero size, capped at 320px wide. `small`: the
   * episode page's line.
   */
  size?: "hero" | "large" | "small";
  className?: string;
}) {
  const box =
    size === "large"
      ? "max-h-[112px] max-w-[min(320px,100%)]"
      : size === "hero"
        ? "max-h-[70px] max-w-[260px] lg:max-h-[100px] lg:max-w-[min(420px,100%)]"
        : "max-h-[18px] max-w-[96px] lg:max-h-[24px] lg:max-w-[120px]";
  if (logo) {
    const width = 500;
    const height = Math.max(1, Math.round(width / logo.ratio));
    // The small one sits beside the episode's name, which is that page's heading.
    const Tag = size === "small" ? "span" : "h1";
    // The phone's and the desktop's copies share one `sizes`, so both resolve
    // to the same file and it downloads once, whichever of them is hidden.
    const sizes = size === "small" ? "120px" : "(min-width: 64rem) 420px, 320px";
    return (
      <Tag className={`m-0 flex leading-none ${className}`}>
        <Image
          src={tmdbSrc(logo.path)}
          alt={title}
          width={width}
          height={height}
          sizes={sizes}
          priority={size !== "small"}
          className={`block h-auto w-auto object-contain ${box}`}
        />
      </Tag>
    );
  }
  if (size !== "small") {
    // Typed in place of lettering, it grows with the lettering, by the same
    // factor as the width cap (320/260).
    const type = size === "large" ? "text-[54px] leading-[0.94]" : "text-[44px] leading-[0.95] lg:text-[64px] lg:leading-[0.92]";
    return <h1 className={`m-0 font-display font-extrabold tracking-[-0.04em] text-balance ${type} ${className}`}>{title}</h1>;
  }
  return (
    <span className={`font-display text-[15px] font-extrabold tracking-[-0.02em] ${className}`}>{title}</span>
  );
}

/**
 * One figure in a hero's score row: big enough to read across the room. It
 * takes the row's two tracks (`ScoreRow`), the figure centred in the first.
 */
export function Score({ value, label }: { value: string; label: string }) {
  return (
    <span className="row-span-2 grid grid-rows-subgrid justify-items-start">
      <span className="self-center font-display text-[22px] font-extrabold leading-none tracking-[-0.03em] text-white">{value}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-white/78">{label}</span>
    </span>
  );
}

/**
 * The score row: two tracks shared by every column, figures above and labels
 * below, so the labels stand on one line and each figure is centred on the
 * first track whatever its height. Your rating's pill is taller than a figure
 * and wants 9px of air above its label; the gap between the tracks is that
 * 9px whenever the pill is in the row, and the figures, centred on the pill,
 * sit that little further from their labels. Without it, a hairline.
 */
export function ScoreRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid auto-cols-max grid-flow-col grid-rows-[auto_auto] gap-x-7 gap-y-px has-data-pill:gap-y-[9px] lg:gap-x-8 ${className}`}
    >
      {children}
    </div>
  );
}

/** The poster on a hero: 140px centred on phones, 250px beside the details on desktop. */
export function HeroPoster({ path, title, className = "", children }: { path: string | null; title: string; className?: string; children?: ReactNode }) {
  return (
    <span className={`relative shrink-0 overflow-hidden leading-none ${className}`}>
      {path ? (
        <Image
          src={tmdbSrc(path)}
          alt={`Poster for ${title}`}
          width={250}
          height={375}
          // One `sizes` for both copies, so the phone and desktop posters
          // resolve to the same file and it downloads once.
          sizes="(min-width: 64rem) 250px, 140px"
          priority
          className="block size-full object-cover"
        />
      ) : (
        <PosterPlaceholder title={title} className="size-full" />
      )}
      {children}
    </span>
  );
}

/**
 * Under the title on a series or film page: the tagline in italics where
 * there is one, then the line of facts (`lib/meta-line.ts`) between middle
 * dots. The facts are `ink-2` as the owner asked, but the dark ramp's `ink-2`
 * in either theme: the hero is dark in both, and the light ramp's would be
 * grey on near-black. Hence `data-theme="dark"` on the block, which carries
 * the dark tokens down to it alone.
 */
export function TitleFacts({ tagline, facts, centred = false }: { tagline: string | null; facts: string[]; centred?: boolean }) {
  if (!tagline && facts.length === 0) return null;
  return (
    <div data-theme="dark" className={`flex flex-col gap-1 ${centred ? "items-center text-center" : ""}`}>
      {tagline && <p className="m-0 text-[13px] italic text-white/78 lg:text-sm">{tagline}</p>}
      {facts.length > 0 && <p className="m-0 text-[13px] text-ink-2 lg:text-sm">{facts.join(" · ")}</p>}
    </div>
  );
}
