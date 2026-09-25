"use client";

import { useOptimistic, useTransition } from "react";
import { followPerson } from "@/lib/person-actions";
import { Icon } from "./icon";

/**
 * Follow on a person's hero. Shows the new state at once and writes behind
 * it; the page re-renders from the row, so a failed write falls back. On the
 * hero, which is dark in both themes: glass to follow, white once following,
 * the same pair the hero's other buttons use for off and on.
 */
export function FollowButton({ personId, name, initial, size = "sm" }: { personId: number; name: string; initial: boolean; size?: "sm" | "md" }) {
  const [on, setOn] = useOptimistic(initial);
  const [, startTransition] = useTransition();
  const box = size === "md" ? "h-11 px-[18px]" : "h-9 px-3.5";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Following ${name}. Unfollow` : `Follow ${name}`}
      onClick={() =>
        startTransition(async () => {
          setOn(!on);
          await followPerson(personId, !on);
        })
      }
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-0 text-[13px] font-semibold ${box} ${
        on ? "bg-white text-black" : "bg-white/16 text-white backdrop-blur-[10px] hover:bg-white/24"
      }`}
    >
      <Icon name={on ? "check" : "plus"} size={16} />
      {on ? "Following" : "Follow"}
    </button>
  );
}
