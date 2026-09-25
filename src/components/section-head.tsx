import type { ReactNode } from "react";
import { Icon } from "./icon";
import { Link } from "./link";

/**
 * A section's heading row: the title, a quiet count or span beside it, and a
 * chevron to the full list where there is one. Nowhere to go, no chevron: an
 * arrow that leads nowhere is worse than none. `onDark` is for a head on a
 * band that is dark in both themes, where the title inherits the band's white
 * and the quiet parts are white too rather than the theme's grey.
 */
export function SectionHead({
  id,
  title,
  meta,
  href,
  onDark = false,
  hrefClassName = "",
  children,
}: {
  id?: string;
  title: string;
  meta?: string;
  href?: string;
  onDark?: boolean;
  /** Where the chevron shows, when a control takes its place at one width (Also waiting's fold on phones). */
  hrefClassName?: string;
  /** A control at the right end, after the chevron. */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 id={id} className="m-0 font-display text-xl font-bold leading-[1.05] tracking-[-0.025em] lg:text-[22px]">
        {title}
      </h2>
      {meta && (
        <span className={onDark ? "font-mono text-[11px] font-medium uppercase tracking-[0.05em] text-white/78" : "mono-label"}>
          {meta}
        </span>
      )}
      <span className="grow" />
      {href && (
        <Link
          href={href}
          aria-label={`See all ${title}`}
          className={`inline-flex self-center transition-[translate,color] duration-(--fast) ease-out hover:translate-x-0.5 ${onDark ? "text-white/78 hover:text-white" : "text-ink-3 hover:text-ink"} ${hrefClassName}`}
        >
          <Icon name="chevR" size={18} />
        </Link>
      )}
      {children}
    </div>
  );
}
