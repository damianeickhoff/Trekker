"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
import { Link } from "./link";
import { iconButtonClass, type ButtonKind } from "./ui";

/**
 * Detail pages go back rather than to a fixed parent, so a title opened from
 * the calendar returns to the calendar. An installed app opened straight onto
 * a detail page has nothing to go back to, and goes home instead.
 */
export function BackButton({ kind = "ghost" }: { kind?: ButtonKind }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      className={iconButtonClass(kind, "sm")}
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
    >
      <Icon name="chevL" size={20} />
    </button>
  );
}

/**
 * The way back on a page below a tab, by the one rule: below 64rem a round
 * icon button top-left, where a thumb expects it; from 64rem a text link
 * naming the destination ("‹ Lists"), above the page title, since a desktop
 * has room to say where it goes. Both are rendered and one is hidden, so the
 * server never has to guess the width.
 *
 * `history` is for pages with more than one way in (Cast, a person): the press
 * goes back through history, as `BackButton` does, and `href` is only where it
 * lands when there is no history to go back through. Without it, `href` is a
 * plain link, for pages reached from one place only (the watchlist from Lists).
 *
 * `desktopOnly` draws the text link alone, for a page whose phone button is
 * drawn elsewhere: the series and film heroes, whose phone top row carries
 * `BackButton` beside the menus.
 */
export function Back({
  href,
  name,
  history = false,
  onHero = false,
  desktopOnly = false,
}: {
  href: string;
  /** The destination as the link names it: "Lists", "Home", the title's name. */
  name: string;
  history?: boolean;
  /** On a hero, which is dark in both themes: a glass button and white type. */
  onHero?: boolean;
  desktopOnly?: boolean;
}) {
  const router = useRouter();
  const onClick = history
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }
    : undefined;
  const label = name === "Back" ? "Back" : `Back to ${name}`;
  const text = onHero ? "text-white/80 hover:text-white" : "text-ink-2 hover:text-ink";
  return (
    <>
      {!desktopOnly && (
        <Link
          href={href}
          onClick={onClick}
          aria-label={label}
          className={iconButtonClass(onHero ? "glass" : "ghost", "sm", "lg:hidden")}
        >
          <Icon name="chevL" size={20} />
        </Link>
      )}
      <Link
        href={href}
        onClick={onClick}
        aria-label={label}
        className={`hidden items-center gap-1.5 text-[13px] font-semibold lg:inline-flex ${text}`}
      >
        <Icon name="chevL" size={16} />
        {name}
      </Link>
    </>
  );
}
