import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { Link } from "./link";
import { PRESS } from "./motion";
import { TrekkerMark } from "./trekker-mark";

/*
 * The component library the mockups established. Styles are exported as class
 * builders as well as components, because the same button is sometimes a
 * <button>, sometimes a link and sometimes a form submit.
 */

// ---------- buttons ----------

/**
 * Primary is ink-on-bg and inverts per theme; on a hero it is white. Glass is
 * for hero buttons only, and is one of the two places `backdrop-filter` is
 * allowed; everywhere else the secondary button is a plain surface, whose
 * fill lifts one step under a pointer. Every kind presses (`PRESS`).
 */
export type ButtonKind = "primary" | "white" | "amber" | "glass" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_KIND: Record<ButtonKind, string> = {
  primary: "bg-primary text-on-primary",
  white: "bg-white text-black",
  amber: "bg-accent text-black",
  glass: "bg-white/16 text-white backdrop-blur-[10px]",
  ghost: "bg-surface text-ink shadow-elevation hover:bg-surface-2",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-10 px-[18px]",
  md: "h-11 px-[18px]",
  lg: "h-12 px-5",
};

const ICON_BUTTON_SIZE: Record<ButtonSize, string> = { sm: "size-10", md: "size-11", lg: "size-12" };

export function buttonClass(kind: ButtonKind = "primary", size: ButtonSize = "md", extra = "") {
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 text-sm font-semibold disabled:opacity-60 ${PRESS} ${BUTTON_KIND[kind]} ${BUTTON_SIZE[size]} ${extra}`;
}

export function iconButtonClass(kind: ButtonKind = "ghost", size: ButtonSize = "md", extra = "") {
  return `inline-flex shrink-0 items-center justify-center rounded-full border-0 ${PRESS} ${BUTTON_KIND[kind]} ${ICON_BUTTON_SIZE[size]} ${extra}`;
}

export function IconLink({
  icon,
  label,
  kind = "ghost",
  size = "sm",
  ...props
}: { icon: IconName; label: string; kind?: ButtonKind; size?: ButtonSize } & Omit<
  ComponentProps<typeof Link>,
  "children"
>) {
  return (
    <Link aria-label={label} className={iconButtonClass(kind, size)} {...props}>
      <Icon name={icon} size={20} />
    </Link>
  );
}

// ---------- chips ----------

const CHIP_BASE =
  "inline-flex items-center whitespace-nowrap rounded-md font-mono font-semibold uppercase tracking-[0.05em]";
const CHIP_SIZE = { sm: "h-5 px-[7px] text-[10px] gap-[5px]", md: "h-6 px-[9px] text-[11px] gap-[5px]" };

/** Amber is state: up next, today, earned, in cinemas. Nothing else is amber. */
export function StateChip({ children, small }: { children: ReactNode; small?: boolean }) {
  return <span className={`${CHIP_BASE} ${CHIP_SIZE[small ? "sm" : "md"]} bg-accent text-black`}>{children}</span>;
}

/** White with a play mark: the play mark only ever means Plex. */
export function PlexChip({ small }: { small?: boolean }) {
  return (
    <span className={`${CHIP_BASE} ${CHIP_SIZE[small ? "sm" : "md"]} bg-white text-black`}>
      <Icon name="play" size={small ? 11 : 12} />
      On Plex
    </span>
  );
}

/**
 * A pending Overseerr request: state, so amber, with the clock the poster
 * mark uses for the same thing. Only where the title is not on Plex yet.
 */
export function RequestedChip({ small }: { small?: boolean }) {
  return (
    <StateChip small={small}>
      <Icon name="clock" size={small ? 11 : 12} />
      Requested
    </StateChip>
  );
}

/**
 * Facts: network, runtime, schedule. On a hero they take a translucent fill so
 * they read over any artwork.
 */
export function QuietChip({ children, onHero }: { children: ReactNode; onHero?: boolean }) {
  const tone = onHero ? "border-white/28 bg-black/38 text-white/78" : "border-line text-ink-2";
  return (
    <span className={`${CHIP_BASE} h-6 border px-[9px] text-[11px] font-medium ${tone}`}>{children}</span>
  );
}

/** A label on artwork, such as a score. No blur: it sits on scrolling rails. */
export function ArtChip({ children, small }: { children: ReactNode; small?: boolean }) {
  return <span className={`${CHIP_BASE} ${CHIP_SIZE[small ? "sm" : "md"]} bg-black/55 text-white`}>{children}</span>;
}

/** The rounded filter and season chip. It presses, and an unchosen one lifts its fill under a pointer, as a ghost button does. */
export function filterChipClass(on: boolean) {
  return `inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full border-0 px-3.5 text-[13px] font-semibold ${PRESS} ${
    on ? "bg-primary text-on-primary" : "bg-surface text-ink shadow-elevation hover:bg-surface-2"
  }`;
}

/**
 * The amber switch from the mockups, as a track and a knob. The knob slides
 * by `translate` rather than `left`, so it moves without laying anything out,
 * and the amber fades in over the same `--fast`, so on and off read as one
 * motion.
 */
export function switchTrackClass(on: boolean) {
  return `relative inline-block h-[26px] w-11 shrink-0 rounded-full border-0 p-0 transition-colors duration-(--fast) ease-out ${on ? "bg-accent" : "bg-surface-2"}`;
}

export function switchKnobClass(on: boolean) {
  return `absolute left-[3px] top-[3px] size-5 rounded-full transition-[translate,background-color] duration-(--fast) ease-out ${
    on ? "translate-x-[18px] bg-black" : "translate-x-0 bg-ink-3"
  }`;
}

// ---------- identity ----------

/**
 * The mark in amber beside the lettering, standing on the baseline at the
 * lettering's cap height (Bricolage's capitals are 0.72 of the size), so
 * the two read as one line of type at any size.
 */
export function Wordmark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-[0.3em] font-display font-extrabold tracking-[-0.035em] ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      <TrekkerMark height={Math.round(size * 0.72)} className="text-accent" />
      Trekker
    </span>
  );
}

/**
 * Stands in for the user's avatar until profiles are read (step 7): the chrome
 * does not wait on a user row, so it cannot know a face or initials yet.
 */
export function AvatarPlaceholder({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 shadow-[0_0_0_2px_var(--accent)]"
      style={{ width: size, height: size }}
    >
      <Icon name="user" size={Math.round(size * 0.5)} />
    </span>
  );
}

// ---------- type ----------

export function PageTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={`m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em] ${className}`}>
      {children}
    </h1>
  );
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`m-0 font-display text-xl font-bold leading-[1.05] tracking-[-0.025em] lg:text-[22px] ${className}`}>
      {children}
    </h2>
  );
}

// ---------- inputs ----------

export function Field({ label, ...input }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="mono-label">{label}</span>
      <input
        {...input}
        className="h-[46px] w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-ink-3"
      />
    </label>
  );
}
