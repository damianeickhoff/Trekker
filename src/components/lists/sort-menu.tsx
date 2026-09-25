"use client";

import { Icon } from "../icon";
import { Link } from "../link";
import { MENU, MENU_ITEM, usePopover } from "../title/popover";
import { PRESS } from "../motion";

/**
 * The overview's "Sort: recently added": quiet text that opens the orders.
 * Each is an address, replacing the entry so the back button leaves the page
 * rather than stepping back through orders.
 */
export function SortMenu({ current, options }: { current: string; options: { href: string; label: string; on: boolean }[] }) {
  const { open, setOpen, ref, shown, state } = usePopover();
  return (
    <div ref={ref} className="relative self-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${PRESS} inline-flex items-center border-0 bg-transparent p-0 text-[13px] font-semibold text-ink-2 hover:text-ink`}
      >
        Sort: {current.toLowerCase()}
      </button>
      {shown && (
        <div role="menu" data-state={state} className={`${MENU} right-0 top-[calc(100%+8px)] w-52 origin-top-right`}>
          {options.map((o) => (
            <Link
              key={o.href}
              role="menuitemradio"
              aria-checked={o.on}
              href={o.href}
              replace
              scroll={false}
              onClick={() => setOpen(false)}
              className={MENU_ITEM}
            >
              <span className="grow">{o.label}</span>
              {o.on && <Icon name="check" size={16} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
