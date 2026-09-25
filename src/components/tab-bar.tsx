"use client";

import { usePathname } from "next/navigation";
import { Icon } from "./icon";
import { Link } from "./link";
import { PHONE_TABS, isActive, showsTabBar } from "./nav";

/**
 * Phones: a floating dark pill in both themes, so artwork keeps the whole
 * width. It is one of the two places `backdrop-filter` is allowed; it does not
 * scroll, so the blur is composited once rather than every frame.
 *
 * Pinned to the viewport by a full-width fixed strip at `bottom: 0` that pads
 * itself up rather than by a `bottom` offset: the inset lives in padding, where
 * every standalone WebKit reports it, and the strip itself never depends on how
 * tall the page is. The padding is the larger of an 18px float and the
 * home-indicator inset, not their sum: in a browser tab the inset is 0 and the
 * bar floats, and in the installed app it sits just above the indicator rather
 * than 18px above that. The strip lets touches through; only the pill takes
 * them. `main` clears it with `--tab-bar-clearance` (see `globals.css`), which
 * uses the same `max`.
 *
 * The active tab's pill carries its label and so is wider than its neighbours.
 * Widths come from `flex-grow` over a zero basis, 1 for each inactive slot and
 * `ACTIVE_GROW` for the active one, and the grow value is transitioned: on a
 * tab change the old pill narrows while the new one widens, so the neighbours
 * slide rather than jump. Sizing the pill by its content could not do that,
 * since a width that follows content snaps when the content changes. Every
 * slot draws the same elements, with the label collapsed to nothing when
 * inactive, so there is something to transition from.
 *
 * It runs on the motion tokens, `--base` and `--ease-out` (`globals.css`).
 * It is the one standing exception to "transform and opacity only": the
 * grow value lays out five boxes in a fixed 64px bar that nothing else
 * shares, which costs less than a measured transform would to write, and it
 * predates the rule. Nothing about it plays on first paint.
 */
export function TabBar() {
  const pathname = usePathname();
  if (!showsTabBar(pathname)) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-(--z-tab-bar) px-4 pb-(--tab-float) lg:hidden">
      <nav
        aria-label="Main"
        className="pointer-events-auto flex h-16 items-center rounded-[32px] bg-pill px-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[16px]"
      >
        {PHONE_TABS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              data-tab-slot=""
              className={`${TAB_SLOT} ${active ? ACTIVE_GROW : "grow"}`}
            >
              <span
                className={`flex h-12 w-full min-w-0 items-center justify-center rounded-3xl text-[12px] font-bold transition-[color,background-color,padding] duration-(--base) ease-out motion-reduce:transition-none ${
                  active ? "bg-accent px-2.5 text-black" : "bg-transparent px-0 text-white/70"
                }`}
              >
                <Icon name={item.icon} size={active ? 18 : 22} />
                <span
                  aria-hidden="true"
                  className={`overflow-hidden whitespace-nowrap transition-[opacity,max-width,margin] duration-(--base) ease-out motion-reduce:transition-none ${
                    active ? "ml-1.5 max-w-24 opacity-100" : "ml-0 max-w-0 opacity-0"
                  }`}
                >
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Against 1 for each of the four others. At 2.4 the pill is about 125px on a
 * 375px phone and 105px on a 320px one, room for the longest label, Calendar,
 * beside its icon without truncating.
 */
const ACTIVE_GROW = "grow-[2.4]";

/** Every slot; only the grow value differs, and that is what slides. */
const TAB_SLOT =
  "flex h-12 min-w-0 basis-0 items-center justify-center px-0.5 transition-[flex-grow] duration-(--base) ease-out motion-reduce:transition-none";
