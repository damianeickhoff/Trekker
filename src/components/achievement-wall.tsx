"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { AchievementState } from "@/lib/achievements";
import { AchievementDialog } from "./achievement-dialog";

/**
 * Holds which achievement is open, for every card on the page.
 *
 * The open one lives in the URL as `?badge=<id>` rather than in component state,
 * which buys three things for nothing: a notification can link straight to a
 * badge, the back button closes the dialog instead of leaving the page, and the
 * whole thing survives a refresh. `replace` rather than `push` on close, so the
 * history does not fill up with a stack of opened and closed dialogs.
 */
/**
 * Opens a badge. Deliberately does *not* read the URL — only writes to it — so
 * that the cards can use it without every one of them subscribing to
 * `useSearchParams`, which would drag a Suspense boundary around each card on a
 * page that has forty of them.
 *
 * `scroll: false` keeps the wall exactly where it was; opening a dialog should
 * not also throw you back to the top of a very long page.
 */
export function useOpenBadge() {
  const router = useRouter();

  const setOpen = useCallback(
    (id: string | null) => {
      if (id) router.push(`/achievements?badge=${id}`, { scroll: false });
      else router.replace("/achievements", { scroll: false });
    },
    [router],
  );

  return { setOpen };
}

/**
 * Renders whichever badge `?badge=` names. Mounted once for the whole page, and
 * the only thing here that reads the URL — hence the Suspense boundary around
 * it at the call site.
 */
export function AchievementWall({ achievements }: { achievements: AchievementState[] }) {
  const params = useSearchParams();
  const { setOpen } = useOpenBadge();

  const item = achievements.find((a) => a.id === params.get("badge")) ?? null;
  if (!item) return null;

  return <AchievementDialog item={item} onClose={() => setOpen(null)} />;
}
