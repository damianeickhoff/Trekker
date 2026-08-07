"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A panel anchored to whatever opened it, drawn on `document.body`.
 *
 * The portal is not decoration. `WatchedDateMenu` learned this the hard way:
 * the panels on a title page open from inside rounded cards that clip their
 * overflow, and from inside `.rise`, which animates a transform and therefore
 * becomes the containing block for anything positioned. Either one turns an
 * `absolute` panel into a sliver. Leaving the tree entirely is the only fix
 * that holds everywhere, and the cost is having to place it by hand.
 *
 * That hand-placing is what the rest of this is: measure the trigger, flip
 * upwards when there is no room below, and keep the whole thing on screen
 * horizontally. It closes on Escape, on a click outside, and on any scroll that
 * could have moved the trigger out from under it.
 */
export function Popover({
  anchor,
  onClose,
  width = 264,
  align = "start",
  children,
}: {
  /** The element to hang off — usually the button that opened this. */
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  width?: number;
  /** Which edge of the panel lines up with the matching edge of the trigger. */
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const trigger = anchor.current;
    const panel = ref.current;
    if (!trigger || !panel) return;

    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const height = panel.offsetHeight || 280;
      const below = window.innerHeight - rect.bottom;

      const top =
        below < height + 16 && rect.top > height + 16 ? rect.top - height - 8 : rect.bottom + 8;

      const preferred = align === "end" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(8, preferred), window.innerWidth - width - 8);

      // Only ever set a *different* position. The panel is measured by a
      // ResizeObserver that this same call can wake up again, so writing an
      // identical box back would be a loop rather than a no-op.
      setBox((current) =>
        current && current.top === top && current.left === left ? current : { top, left },
      );
    };

    // The panel grows and shrinks under its own steam — the rename field
    // replaces two rows with three, the delete confirmation replaces the lot —
    // and a menu that stays anchored to where it used to end hangs off the
    // bottom of the screen. Watching its size is what keeps it pinned.
    const observer = new ResizeObserver(place);
    observer.observe(panel);

    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor, align, width]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;

      // A dialog opened from inside this panel is portalled to the body, which
      // puts every click in it "outside" as far as the check above is
      // concerned. Closing on those unmounted the row that owns the dialog, and
      // the dialog with it — which read as taps going straight through it.
      const element = target instanceof Element ? target : target.parentElement;
      const dialog = element?.closest('[role="dialog"]');
      if (dialog && dialog !== ref.current) return;
      // The trigger closes this itself, by toggling. Letting the outside-click
      // handler see it too would close and immediately reopen.
      if (anchor.current?.contains(target)) return;
      onClose();
    }

    // Capture, because a scroll inside a nested element does not bubble.
    function onScroll() {
      onClose();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ top: box?.top ?? -9999, left: box?.left ?? -9999, width }}
      className="ios-menu fixed z-50 overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/95 shadow-2xl shadow-ink-950/60 backdrop-blur-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}
