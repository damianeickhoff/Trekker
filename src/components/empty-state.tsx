import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/**
 * Every empty state in the app: a dashed block with an icon, one line of what
 * goes here, one line of how to change that, and a button when there is
 * somewhere to go. From the mockups' `emptyBlock`; one component so a quiet
 * screen anywhere reads as intended rather than broken.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className = "",
}: {
  icon: IconName;
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-ink-3 px-6 py-7 text-center ${className}`}
    >
      <span className="inline-flex size-[52px] items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <Icon name={icon} size={24} />
      </span>
      <span className="font-display text-lg font-bold tracking-[-0.02em]">{title}</span>
      <p className="m-0 max-w-[360px] text-[13px] leading-[1.45] text-ink-2">{children}</p>
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  );
}
