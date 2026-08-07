"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleFavourite, type TitleInput } from "@/lib/list-actions";
import { FLOATING_ICON } from "./back-button";

/**
 * The heart. A glyph and nothing else, deliberately.
 *
 * "Do I love this?" is one bit, answered instantly and reversed just as
 * instantly, so it gets the smallest control on the row — a square beside the
 * pair of pills rather than a third of the width of them. A word next to it
 * would give it the same weight as marking something watched, which is a claim
 * about your life, or saving it, which opens a menu. This does neither.
 *
 * Filled when it is on. That is the whole state, which is why there is no
 * spinner: the icon has already changed by the time the request goes out, and a
 * failed one puts it back.
 *
 * It sits with the trailer and the overflow menu rather than with the watch
 * pair, and immediately before the menu — which is where the two icon-only
 * squares end up beside each other, and where "the small things you do to a
 * title" have always lived. Like them it is rendered twice per page, floating
 * over the artwork on a phone and in the action row on a desktop, because those
 * are two different subtrees and no amount of CSS moves an element between them.
 */
export function FavouriteButton({
  item,
  initial,
  variant = "button",
}: {
  item: TitleInput;
  initial: boolean;
  /** `icon` floats over the artwork on a phone; `button` squares up on desktop. */
  variant?: "icon" | "button";
}) {
  const [favourite, setFavourite] = useState(initial);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={favourite}
      aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
      title={favourite ? "Remove from favourites" : "Add to favourites"}
      onClick={() => {
        const next = !favourite;
        setFavourite(next);

        startTransition(async () => {
          const result = await toggleFavourite(item);
          setFavourite(result.favourite);
        });
      }}
      className={
        variant === "icon"
          ? // The floating glass is taken whole and left alone. Tinting its
            // border or its background would mean two `bg-*` classes in one
            // string, which resolve by stylesheet order rather than by which was
            // written last — a coin toss. The glyph carries the state instead,
            // and it is on a different element, so nothing competes.
            FLOATING_ICON
          : // Squared to the height of the pills beside it rather than sized to
            // its own glyph: a 50px box is what the overflow menu next to it
            // uses, and controls of three different heights on one row read as
            // an accident.
            `grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl border backdrop-blur-sm transition active:scale-[0.98] ${
              favourite
                ? "border-rose-500/70 bg-rose-600/20 text-rose-400 hover:border-rose-400 hover:bg-rose-600/30"
                : "ios-surface ios-bright border-ink-600/70 bg-ink-900/50 text-ink-300 hover:border-rose-500 hover:bg-ink-800/80 hover:text-rose-400 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
            }`
      }
    >
      <Heart
        size={variant === "icon" ? 17 : 18}
        fill={favourite ? "currentColor" : "none"}
        className={favourite ? "text-rose-400" : undefined}
      />
    </button>
  );
}
