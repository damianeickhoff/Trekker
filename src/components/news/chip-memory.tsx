"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CHIP_IDS } from "@/lib/news-chips";

const KEY = "trekker-news-chip";

/**
 * "Open on: Last used" (Settings › News, Round 10). The chip someone chose is
 * remembered in this browser whenever the address names one; and when the
 * page is opened without one and the setting says Last used, the remembered
 * chip replaces the address after paint. The server cannot know it, so the
 * first paint is For you for a moment; storage that throws (a private window)
 * simply leaves it there.
 */
export function ChipMemory({ chip, named, openLast }: { chip: string; named: boolean; openLast: boolean }) {
  const router = useRouter();
  useEffect(() => {
    try {
      if (named) {
        localStorage.setItem(KEY, chip);
        return;
      }
      if (!openLast) return;
      const saved = localStorage.getItem(KEY);
      if (saved && saved !== chip && (CHIP_IDS as readonly string[]).includes(saved)) router.replace(`/news?tab=${saved}`, { scroll: false });
    } catch {
      // No storage here: For you it is.
    }
  }, [chip, named, openLast, router]);
  return null;
}
