"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePresenceState } from "../presence";

/**
 * A small modal for the lists section's questions: a name for a new list,
 * renaming, deleting, requesting. A sheet from the foot on phones, centred on
 * a desktop. Escape or a press on the shade closes it; focus goes to its first
 * field or button when it opens, and back where it was when it closes.
 *
 * Portalled to the body, so no card, hero or top row it is opened from can hold
 * it under the tab bar or a later section (`--z-sheet` in `globals.css`). It
 * only ever opens after a press, so there is always a document to portal into.
 *
 * Opened inside a `Presence`, it arrives and leaves (`motion-sheet`,
 * `motion-scrim`): up from the foot on a phone, from 0.96 on a desktop. On a
 * phone the grab bar at its top drags it down, and a drag of more than
 * `DRAG_CLOSE` closes it; a shorter one springs back.
 */
const DRAG_CLOSE = 80;

export function Dialog({
  label,
  onClose,
  children,
  wide = false,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const state = usePresenceState();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, button, a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);

  // The drag writes the panel's `translate` directly: one style per pointer move, no render, no loop.
  const drag = useRef<{ from: number; by: number } | null>(null);
  const settle = (closing: boolean) => {
    const p = panel.current;
    drag.current = null;
    if (!p || closing) return;
    p.style.transition = "translate var(--fast) var(--ease-out)";
    p.style.translate = "";
  };
  const grab = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = { from: e.clientY, by: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
      if (panel.current) panel.current.style.transition = "none";
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || !panel.current) return;
      d.by = Math.max(0, e.clientY - d.from);
      panel.current.style.translate = `0 ${d.by}px`;
    },
    // Past the line it closes from where the finger let go: the exit's transform adds to this translate.
    onPointerUp: () => {
      const far = (drag.current?.by ?? 0) > DRAG_CLOSE;
      settle(far);
      if (far) close.current();
    },
    onPointerCancel: () => settle(false),
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-state={state}
      className="motion-scrim fixed inset-0 z-(--z-sheet) flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-state={state}
        className={`motion-sheet flex max-h-[85dvh] w-full flex-col gap-4 overflow-y-auto rounded-[22px] border border-line bg-bg p-5 text-ink shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${wide ? "max-w-lg" : "max-w-sm"}`}
      >
        <div
          aria-hidden="true"
          {...grab}
          className="-mx-5 -mb-5 -mt-5 flex h-7 shrink-0 cursor-grab touch-none items-center justify-center sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-ink-3/45" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 font-display text-xl font-bold tracking-[-0.02em]">{children}</h2>;
}
