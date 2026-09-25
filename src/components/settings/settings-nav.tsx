"use client";

import { Icon } from "../icon";
import { Link } from "../link";
import { FactLine } from "./facts";
import { SECTION_COPY, sectionHref, type NavItem, type SettingsSection } from "./nav-items";

/**
 * The desktop's list of sections beside the one being read. Each entry is a
 * link to its section's own address, so a reload and the back button keep
 * the place: an icon tile (amber with a black icon for the one open, since
 * where you are is state), the name, and under it what that section holds,
 * from the same summaries the phone's cards write.
 */
export function SettingsNav({ items, current }: { items: NavItem[]; current: SettingsSection }) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-1">
      {items.map((item) => {
        const on = item.id === current;
        const copy = SECTION_COPY[item.id];
        return (
          <Link
            key={item.id}
            href={sectionHref(item.id)}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[14px] px-2.5 py-2 ${on ? "bg-surface" : "hover:bg-surface"}`}
          >
            <span
              className={`inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] ${
                on ? "bg-accent text-black" : "bg-surface-2 text-ink-2"
              }`}
            >
              <Icon name={copy.icon} size={17} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">{copy.label}</span>
              <span className="truncate text-xs text-ink-3">{item.line ? <FactLine kind={item.line} /> : item.text}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
