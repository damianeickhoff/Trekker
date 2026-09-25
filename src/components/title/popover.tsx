"use client";

import { useEffect, useRef, useState } from "react";
import { EXIT, usePresence } from "../presence";

/**
 * Open and shut for a small menu anchored to its button: a press anywhere
 * else or Escape closes it. The same behaviour as Home's card menu, shared by
 * the title pages' menus. `shown` is whether to draw the menu, which it stays
 * for `--fast` after closing, and `state` goes on it as `data-state`, so the
 * menu (`MENU`, which is `motion-pop`) scales in from its corner and fades
 * out rather than cutting.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { mounted: shown, state } = usePresence(open, EXIT.fast);
  return { open, setOpen, ref, shown, state };
}

/** The dark menu surface, the same in both themes, as Home's card menu draws it. */
export const MENU =
  "motion-pop absolute z-(--z-popover) flex flex-col rounded-2xl bg-pill p-1.5 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]";

/** The corner a menu grows from, which is the one its anchor class pins it by. */
export function menuOrigin(anchor: string) {
  return /(^|\s)left-/.test(anchor) ? "origin-top-left" : "origin-top-right";
}

export const MENU_ITEM =
  "flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold text-white transition-colors duration-(--fast) ease-out hover:bg-white/10 disabled:opacity-50";
