"use client";

import { useEffect, useRef } from "react";

/**
 * The chosen option's fill in a segmented control, as one pill that slides
 * between options instead of jumping, the way the tab bar's does.
 *
 * The control draws its chosen option filled, so the first paint is right
 * without script; after paint this pill measures that option and takes over,
 * marking the group `data-sliding="on"`, and the option's own fill goes
 * transparent. From then on a press moves the pill, and `data-on`, at once,
 * by `translate` over `--base`, before the answer is back: Discover's and
 * the review's chips are addresses, and their page renders again when it
 * arrives, so a slide that waited for it would never be seen. React puts
 * `data-on` where it belongs when it renders. The pill's width is set, not
 * animated, so only `translate` moves (STYLE.md, Motion).
 *
 * Put it first in a `relative` group; the options take `segmentChip` or
 * `segmentOption` (`motion.ts`), which style the chosen one by `data-on`,
 * and carry `data-segment`.
 */
export function SegmentPill({ className }: { className: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  // After every render: the chosen option may have changed, or moved.
  useEffect(() => {
    const pill = ref.current;
    const group = pill?.parentElement;
    if (!pill || !group) return;
    place(pill, group, group.querySelector("[data-segment][data-on]"));
  });

  useEffect(() => {
    const pill = ref.current;
    const group = pill?.parentElement;
    if (!pill || !group) return;
    const onClick = (e: MouseEvent) => {
      const option = (e.target as Element | null)?.closest?.("[data-segment]");
      if (option && group.contains(option) && !option.hasAttribute("aria-disabled")) place(pill, group, option);
    };
    // Fonts arriving, or the window changing, move the options; follow them without a slide.
    const resize = new ResizeObserver(() => place(pill, group, group.querySelector("[data-segment][data-on]"), false));
    group.addEventListener("click", onClick);
    resize.observe(group);
    return () => {
      group.removeEventListener("click", onClick);
      resize.disconnect();
    };
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 top-0 hidden transition-[translate] duration-(--base) ease-out in-data-[sliding=on]:block ${className}`}
    />
  );
}

function place(pill: HTMLElement, group: HTMLElement, option: Element | null, slide = true) {
  if (!(option instanceof HTMLElement)) {
    delete group.dataset.sliding;
    return;
  }
  if (!option.hasAttribute("data-on")) {
    for (const on of group.querySelectorAll<HTMLElement>("[data-segment][data-on]")) delete on.dataset.on;
    option.dataset.on = "";
  }
  const first = group.dataset.sliding !== "on";
  if (first || !slide) pill.style.transition = "none";
  pill.style.width = `${option.offsetWidth}px`;
  pill.style.height = `${option.offsetHeight}px`;
  pill.style.translate = `${option.offsetLeft}px ${option.offsetTop}px`;
  group.dataset.sliding = "on";
  if (first || !slide) {
    // Commit the jump before the transition comes back, or it would slide from nowhere.
    void pill.offsetWidth;
    pill.style.transition = "";
  }
}
